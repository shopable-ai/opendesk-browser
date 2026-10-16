#!/usr/bin/env python3
"""Trigger real Chrome UI zoom with X11 XTEST, not CDP emulation."""
import ctypes
import sys
import time
keys = ctypes.CDLL('libX11.so.6')
test = ctypes.CDLL('libXtst.so.6')
keys.XOpenDisplay.restype = ctypes.c_void_p
keys.XOpenDisplay.argtypes = [ctypes.c_char_p]
keys.XStringToKeysym.restype = ctypes.c_ulong
keys.XStringToKeysym.argtypes = [ctypes.c_char_p]
keys.XKeysymToKeycode.restype = ctypes.c_uint
keys.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
keys.XFlush.argtypes = [ctypes.c_void_p]
keys.XCloseDisplay.argtypes = [ctypes.c_void_p]
test.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
display = keys.XOpenDisplay(None)
if not display:
    raise SystemExit('REAL_CHROME_ZOOM_NOT_TESTED: no X11 display')
def key(name):
    return keys.XKeysymToKeycode(display, keys.XStringToKeysym(name.encode('ascii')))
control, plus, minus = key('Control_L'), key('plus'), key('minus')
assert control and plus and minus, 'X11 zoom accelerator unavailable'
steps = int(sys.argv[1])
if not -12 <= steps <= 12:
    raise SystemExit('Invalid zoom step count')
action = plus if steps > 0 else minus
for _ in range(abs(steps)):
    for k, pressed in ((control, 1), (action, 1), (action, 0), (control, 0)):
        if not test.XTestFakeKeyEvent(display, k, pressed, 0):
            raise SystemExit('REAL_CHROME_ZOOM_NOT_TESTED: XTEST unsupported')
    keys.XFlush(display)
    time.sleep(0.18)
keys.XCloseDisplay(display)
print('REAL_CHROME_UI_ZOOM_ACCELERATOR', steps)
