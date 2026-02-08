#[cfg(target_os = "macos")]
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use lazy_static::lazy_static;

#[cfg(target_os = "macos")]
use objc2_app_kit::{
    NSApplication, NSApplicationActivationOptions, NSRunningApplication, NSWorkspace,
};
#[cfg(target_os = "macos")]
use objc2_foundation::MainThreadMarker;

#[cfg(target_os = "macos")]
use crate::logging::log;

#[cfg(target_os = "macos")]
lazy_static! {
    static ref PREV_PID: Mutex<Option<i32>> = Mutex::new(None);
}

/// Save the currently frontmost app's PID so we can restore it later.
///
/// If Symiosis is already frontmost, preserves the existing saved PID to handle
/// rapid toggle scenarios (prevents losing the restoration target).
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn save_current_frontmost_app() {
    let frontmost = unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        workspace.frontmostApplication()
    };

    let Some(frontmost) = frontmost else {
        return;
    };

    let pid = unsafe { frontmost.processIdentifier() };
    let our_pid = std::process::id() as i32;

    let mut lock = PREV_PID.lock().unwrap_or_else(|e| {
        log("MAC_FOCUS", "PREV_PID mutex was poisoned, recovering", None);
        e.into_inner()
    });

    if pid != our_pid {
        *lock = Some(pid);
    }
}

/// Show and activate the app window.
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn show_app(window: tauri::WebviewWindow) {
    if let Err(e) = window.show() {
        log("MAC_FOCUS", "Failed to show window", Some(&e.to_string()));
    }
    if let Err(e) = window.set_focus() {
        log(
            "MAC_FOCUS",
            "Failed to set window focus",
            Some(&e.to_string()),
        );
    }

    // set_focus alone doesn't fully activate the app at macOS level
    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let app = NSApplication::sharedApplication(mtm);
    unsafe { app.activate() };
}

/// Hide this app and restore focus to the previously-frontmost app.
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn hide_app_and_restore_previous(window: tauri::WebviewWindow) {
    if let Err(e) = window.hide() {
        log("MAC_FOCUS", "Failed to hide window", Some(&e.to_string()));
    }

    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let app = NSApplication::sharedApplication(mtm);
    app.hide(None);

    let prev_pid_opt = {
        let mut lock = PREV_PID.lock().unwrap_or_else(|e| {
            log("MAC_FOCUS", "PREV_PID mutex was poisoned, recovering", None);
            e.into_inner()
        });
        lock.take()
    };

    let Some(prev_pid) = prev_pid_opt else {
        return;
    };

    let prev_app =
        unsafe { NSRunningApplication::runningApplicationWithProcessIdentifier(prev_pid) };

    match prev_app {
        Some(prev_app) => {
            let options = NSApplicationActivationOptions::ActivateAllWindows;
            let success = unsafe { prev_app.activateWithOptions(options) };
            if !success {
                log(
                    "MAC_FOCUS",
                    "Failed to activate previous app",
                    Some(&format!("PID: {}", prev_pid)),
                );
            }
        }
        None => {
            log(
                "MAC_FOCUS",
                "Previous app no longer running",
                Some(&format!("PID: {}", prev_pid)),
            );
        }
    }
}

// Stub implementations for non-macOS platforms
#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn save_current_frontmost_app() {
    // No-op on non-macOS platforms
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn show_app(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
#[cfg(not(target_os = "macos"))]
pub fn hide_app_and_restore_previous(window: tauri::WebviewWindow) {
    let _ = window.hide();
}
