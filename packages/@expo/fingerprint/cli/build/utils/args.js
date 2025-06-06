"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProjectRoot = getProjectRoot;
exports.getFileArgumentAtIndex = getFileArgumentAtIndex;
exports.assertArgs = assertArgs;
exports.requireArg = requireArg;
// Common utilities for interacting with `args` library.
// These functions should be used by every command.
const arg_1 = __importDefault(require("arg"));
const fs_1 = require("fs");
const path_1 = require("path");
const Log = __importStar(require("./log"));
/**
 * Parse the first argument as a project directory.
 *
 * @returns valid project directory.
 */
function getProjectRoot(args) {
    const projectRoot = (0, path_1.resolve)(args._[0] || '.');
    if (!(0, fs_1.existsSync)(projectRoot)) {
        Log.exit(`Invalid project root: ${projectRoot}`);
    }
    return projectRoot;
}
function getFileArgumentAtIndex(args, index) {
    const path = (0, path_1.resolve)(args._[index]);
    if (!(0, fs_1.existsSync)(path)) {
        Log.exit(`Invalid file: ${path}`);
    }
    return path;
}
/**
 * Parse args and assert unknown options.
 *
 * @param schema the `args` schema for parsing the command line arguments.
 * @param argv extra strings
 * @returns processed args object.
 */
function assertArgs(schema, argv) {
    try {
        return (0, arg_1.default)(schema, { argv });
    }
    catch (error) {
        // Ensure unknown options are handled the same way.
        if (error.code === 'ARG_UNKNOWN_OPTION') {
            Log.exit(error.message, 1);
        }
        // Otherwise rethrow the error.
        throw error;
    }
}
function requireArg(args, name) {
    const value = args[name];
    if (value === undefined || value === null) {
        Log.exit(`${name} must be provided`, 1);
    }
    return value;
}
