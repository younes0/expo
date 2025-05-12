import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet } from 'react-native';
import Hls from 'hls.js';

import VideoPlayer, { getSourceUri, isHlsSource } from './VideoPlayer.web';
import type { VideoViewProps } from './VideoView.types';

function createAudioContext(): AudioContext | null {
  return typeof window !== 'undefined' ? new window.AudioContext() : null;
}

function createZeroGainNode(audioContext: AudioContext | null): GainNode | null {
  const zeroGainNode = audioContext?.createGain() ?? null;

  if (audioContext && zeroGainNode) {
    zeroGainNode.gain.value = 0;
    zeroGainNode.connect(audioContext.destination);
  }
  return zeroGainNode;
}

function mapStyles(style: VideoViewProps['style']): React.CSSProperties {
  const flattenedStyles = StyleSheet.flatten(style);
  // Looking through react-native-web source code they also just pass styles directly without further conversions, so it's just a cast.
  return flattenedStyles as React.CSSProperties;
}

export function isPictureInPictureSupported(): boolean {
  return typeof document === 'object' && typeof document.exitPictureInPicture === 'function';
}

export const VideoView = forwardRef((props: { player?: VideoPlayer } & VideoViewProps, ref) => {
  const videoRef = useRef<null | HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null); // Reference for HLS instance
  const mediaNodeRef = useRef<null | MediaElementAudioSourceNode>(null);
  const hasToSetupAudioContext = useRef(false);
  const fullscreenChangeListener = useRef<null | (() => void)>(null);
  const isWaitingForFirstFrame = useRef(false);

  /**
   * Audio context is used to mute all but one video when multiple video views are playing from one player simultaneously.
   * Using audio context nodes allows muting videos without displaying the mute icon in the video player.
   * We have to keep the context that called createMediaElementSource(videoRef), as the method can't be called
   * for the second time with another context and there is no way to unbind the video and audio context afterward.
   */
  const audioContextRef = useRef<null | AudioContext>(null);
  const zeroGainNodeRef = useRef<null | GainNode>(null);

  useImperativeHandle(ref, () => ({
    enterFullscreen: async () => {
      if (!props.allowsFullscreen) {
        return;
      }
      await videoRef.current?.requestFullscreen();
    },
    exitFullscreen: async () => {
      await document.exitFullscreen();
    },
    startPictureInPicture: async () => {
      await videoRef.current?.requestPictureInPicture();
    },
    stopPictureInPicture: async () => {
      try {
        await document.exitPictureInPicture();
      } catch (e) {
        if (e instanceof DOMException && e.name === 'InvalidStateError') {
          console.warn('The VideoView is not in Picture-in-Picture mode.');
        } else {
          throw e;
        }
      }
    },
  }));

  useEffect(() => {
    const onEnter = () => {
      props.onPictureInPictureStart?.();
    };
    const onLeave = () => {
      props.onPictureInPictureStop?.();
    };
    const onLoadStart = () => {
      isWaitingForFirstFrame.current = true;
    };
    const onCanPlay = () => {
      if (isWaitingForFirstFrame.current) {
        props.onFirstFrameRender?.();
      }
      isWaitingForFirstFrame.current = false;
    };
    videoRef.current?.addEventListener('enterpictureinpicture', onEnter);
    videoRef.current?.addEventListener('leavepictureinpicture', onLeave);
    videoRef.current?.addEventListener('loadstart', onLoadStart);
    videoRef.current?.addEventListener('loadeddata', onCanPlay);

    return () => {
      videoRef.current?.removeEventListener('enterpictureinpicture', onEnter);
      videoRef.current?.removeEventListener('leavepictureinpicture', onLeave);
      videoRef.current?.removeEventListener('loadstart', onLoadStart);
      videoRef.current?.removeEventListener('loadeddata', onCanPlay);
    };
  }, [videoRef, props.onPictureInPictureStop, props.onPictureInPictureStart]);

  // Set up HLS.js when src changes
  useEffect(() => {
    const src = getSourceUri(props.player?.src);

    // Clean up any existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!videoRef.current || !src) return;

    // If it's an HLS source and browser doesn't support HLS natively
    if (isHlsSource(src) && Hls.isSupported()) {
      // Native support check (Safari has native HLS support)
      if (!videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        const hls = new Hls({
          debug: false,
          enableWorker: true,
          lowLatencyMode: true,
        });

        hls.loadSource(src);
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
          console.log('HLS media attached');
        });

        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          if (props.player?.playing) {
            videoRef.current?.play();
          }
        });

        hls.on(Hls.Events.ERROR, function (event, data) {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Network error, trying to recover...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Media error, trying to recover...');
                hls.recoverMediaError();
                break;
              default:
                console.error('Unrecoverable HLS error:', data);
                hls.destroy();
                break;
            }
          }
        });

        hlsRef.current = hls;
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [props.player?.src]);

  // Adds the video view as a candidate for being the audio source for the player (when multiple views play from one
  // player only one will emit audio).
  function attachAudioNodes() {
    const audioContext = audioContextRef.current;
    const zeroGainNode = zeroGainNodeRef.current;
    const mediaNode = mediaNodeRef.current;

    if (audioContext && zeroGainNode && mediaNode) {
      props.player.mountAudioNode(audioContext, zeroGainNode, mediaNode);
    } else {
      console.warn(
        "Couldn't mount audio node, this might affect the audio playback when using multiple video views with the same player."
      );
    }
  }

  function detachAudioNodes() {
    const audioContext = audioContextRef.current;
    const mediaNode = mediaNodeRef.current;
    if (audioContext && mediaNode && videoRef.current) {
      props.player.unmountAudioNode(videoRef.current, audioContext, mediaNode);
    }
  }

  function maybeSetupAudioContext() {
    if (
      !hasToSetupAudioContext.current ||
      !navigator.userActivation.hasBeenActive ||
      !videoRef.current
    ) {
      return;
    }
    const audioContext = createAudioContext();

    detachAudioNodes();
    audioContextRef.current = audioContext;
    zeroGainNodeRef.current = createZeroGainNode(audioContextRef.current);
    mediaNodeRef.current = audioContext
      ? audioContext.createMediaElementSource(videoRef.current)
      : null;
    attachAudioNodes();
    hasToSetupAudioContext.current = false;
  }

  function fullscreenListener() {
    if (document.fullscreenElement === videoRef.current) {
      props.onFullscreenEnter?.();
    } else {
      props.onFullscreenExit?.();
    }
  }

  function setupFullscreenListener() {
    fullscreenChangeListener.current = fullscreenListener;
    videoRef.current?.addEventListener('fullscreenchange', fullscreenChangeListener.current);
  }

  function cleanupFullscreenListener() {
    if (fullscreenChangeListener.current) {
      videoRef.current?.removeEventListener('fullscreenchange', fullscreenChangeListener.current);
      fullscreenChangeListener.current = null;
    }
  }

  useEffect(() => {
    if (videoRef.current) {
      props.player?.mountVideoView(videoRef.current);
    }
    setupFullscreenListener();
    attachAudioNodes();

    return () => {
      if (videoRef.current) {
        props.player?.unmountVideoView(videoRef.current);
      }
      cleanupFullscreenListener();
      detachAudioNodes();

      // Clean up HLS
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [props.player]);

  return (
    <video
      controls={props.nativeControls ?? true}
      controlsList={props.allowsFullscreen ? undefined : 'nofullscreen'}
      crossOrigin={props.crossOrigin}
      style={{
        ...mapStyles(props.style),
        objectFit: props.contentFit,
      }}
      onPlay={() => {
        maybeSetupAudioContext();
      }}
      // The player can autoplay when muted, unmuting by a user should create the audio context
      onVolumeChange={() => {
        maybeSetupAudioContext();
      }}
      ref={(newRef) => {
        // This is called with a null value before `player.unmountVideoView` is called,
        // we can't assign null to videoRef if we want to unmount it from the player.
        if (newRef && !newRef.isEqualNode(videoRef.current)) {
          videoRef.current = newRef;
          hasToSetupAudioContext.current = true;
          maybeSetupAudioContext();

          // Reattach HLS if needed when video element changes
          const src = getSourceUri(props.player?.src);
          if (hlsRef.current && isHlsSource(src)) {
            hlsRef.current.attachMedia(newRef);
          }
        }
      }}
      disablePictureInPicture={!props.allowsPictureInPicture}
      playsInline={props.playsInline}
      src={
        !isHlsSource(getSourceUri(props.player?.src)) || !Hls.isSupported()
          ? (getSourceUri(props.player?.src) ?? '')
          : undefined
      }
    />
  );
});

export default VideoView;
