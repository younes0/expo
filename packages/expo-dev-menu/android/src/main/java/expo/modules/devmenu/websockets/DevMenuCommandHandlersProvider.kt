package expo.modules.devmenu.websockets

import android.util.Log
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.packagerconnection.NotificationOnlyHandler
import expo.interfaces.devmenu.DevMenuManagerInterface
import expo.interfaces.devmenu.ReactHostWrapper
import expo.modules.devmenu.devtools.DevMenuDevToolsDelegate
import org.json.JSONObject
import java.lang.ref.WeakReference

class DevMenuCommandHandlersProvider(
  private val manager: DevMenuManagerInterface,
  reactHost: ReactHostWrapper
) {
  private val _host = WeakReference(reactHost)
  private val host
    get() = _host.get()

  private val onReload = object : NotificationOnlyHandler() {
    override fun onNotification(params: Any?) {
      manager.closeMenu()
      UiThreadUtil.runOnUiThread {
        host?.devSupportManager?.handleReloadJS()
      }
    }
  }

  private val onDevMenu = object : NotificationOnlyHandler() {
    override fun onNotification(params: Any?) {
      val activity = host?.currentReactContext?.currentActivity ?: return
      manager.toggleMenu(activity)
    }
  }

  private val onDevCommand = object : NotificationOnlyHandler() {
    override fun onNotification(params: Any?) {
      val host = host ?: return
      val devDelegate = DevMenuDevToolsDelegate(manager, host)

      if (params is JSONObject) {
        val command = params.optString("name") ?: return

        when (command) {
          "reload" -> devDelegate.reload()
          "toggleDevMenu" -> {
            val activity = host.currentReactContext?.currentActivity ?: return
            manager.toggleMenu(activity)
          }
          "toggleElementInspector" -> devDelegate.toggleElementInspector()
          "togglePerformanceMonitor" -> {
            val activity = host.currentReactContext?.currentActivity ?: return
            devDelegate.togglePerformanceMonitor(activity)
          }
          "openJSInspector" -> devDelegate.openJSInspector()
          else -> Log.w("DevMenu", "Unknown command: $command")
        }
      }
    }
  }

  fun createCommandHandlers(): Map<String, NotificationOnlyHandler> {
    return mapOf(
      "reload" to onReload,
      "devMenu" to onDevMenu,
      "sendDevCommand" to onDevCommand
    )
  }
}
