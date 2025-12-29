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
/// If Symiosis is already the frontmost app, the previous value is preserved
/// (not cleared) to handle rapid toggle scenarios correctly. This prevents
/// losing the restoration target when the user presses the shortcut multiple
/// times quickly.
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn save_current_frontmost_app() {
    // SAFETY: Tauri commands run on the main thread. This is enforced by the
    // Tauri framework for commands registered with the invoke handler.
    let mtm = unsafe { MainThreadMarker::new_unchecked() };

    let frontmost = unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        workspace.frontmostApplication()
    };

    let Some(frontmost) = frontmost else {
        // This can happen during system startup or in unusual circumstances.
        // Not logging as this is a rare but valid case.
        return;
    };

    let pid = unsafe { frontmost.processIdentifier() };
    let our_pid = std::process::id() as i32;

    let mut lock = PREV_PID.lock().unwrap_or_else(|e| {
        log("MAC_FOCUS", "PREV_PID mutex was poisoned, recovering", None);
        e.into_inner()
    });

    // Only update if the frontmost app is NOT Symiosis.
    // If Symiosis is already frontmost (e.g., double shortcut press),
    // preserve the previously saved PID rather than clearing it.
    // This fixes the issue where rapid toggles would lose the restoration target.
    if pid != our_pid {
        *lock = Some(pid);
    }
    // If pid == our_pid, intentionally do nothing - preserve existing value
}

/// Show/activate the app and the given Tauri window.
///
/// This function:
/// 1. Shows the Tauri window (no-op if already visible)
/// 2. Sets keyboard focus to the window
/// 3. Activates the NSApplication to ensure proper macOS focus behavior
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn show_app(window: tauri::WebviewWindow) {
    // Show and focus the Tauri window
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

    // Activate the NSApplication to ensure proper macOS focus behavior.
    // This is necessary because set_focus alone may not fully activate
    // the app at the macOS level.
    // SAFETY: Tauri commands run on the main thread
    let mtm = unsafe { MainThreadMarker::new_unchecked() };
    let app = NSApplication::sharedApplication(mtm);
    unsafe {
        app.activate();
    }
}

/// Hide this app and attempt to restore the previously-frontmost app.
///
/// This function:
/// 1. Hides the Tauri window
/// 2. Hides the NSApplication (proper macOS app hiding)
/// 3. Attempts to activate the previously saved app
///
/// If no previous app was saved, or the previous app has quit,
/// macOS will focus the next app in the window stack.
#[tauri::command]
#[cfg(target_os = "macos")]
pub fn hide_app_and_restore_previous(window: tauri::WebviewWindow) {
    // Hide the Tauri window
    if let Err(e) = window.hide() {
        log("MAC_FOCUS", "Failed to hide window", Some(&e.to_string()));
    }

    // SAFETY: Tauri commands run on the main thread
    let mtm = unsafe { MainThreadMarker::new_unchecked() };

    // Hide the NSApplication (ensures proper macOS app hiding behavior,
    // e.g., grayed out in Dock if visible there)
    let app = NSApplication::sharedApplication(mtm);
    app.hide(None);

    // Retrieve and clear the previously saved PID.
    // We use take() to clear after retrieval - this prevents restoring
    // the same app multiple times if hide is called from different code paths.
    let prev_pid_opt = {
        let mut lock = PREV_PID.lock().unwrap_or_else(|e| {
            log("MAC_FOCUS", "PREV_PID mutex was poisoned, recovering", None);
            e.into_inner()
        });
        lock.take()
    };

    // Attempt to restore focus to the previous app
    if let Some(prev_pid) = prev_pid_opt {
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
                // The previous app has quit since we saved its PID.
                // Focus will go to whatever macOS picks (next in window stack).
                log(
                    "MAC_FOCUS",
                    "Previous app no longer running",
                    Some(&format!("PID: {}", prev_pid)),
                );
            }
        }
    }
    // If no prev_pid saved, macOS will focus the next app in the window stack
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
