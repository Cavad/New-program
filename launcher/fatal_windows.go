package main

import (
	"syscall"
	"unsafe"
)

// fatal shows a message box (the exe has no console window) and exits.
func fatal(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	box := user32.NewProc("MessageBoxW")
	title, _ := syscall.UTF16PtrFromString("Timesheet Studio")
	text, _ := syscall.UTF16PtrFromString(msg)
	const mbIconError = 0x10
	_, _, _ = box.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), mbIconError)
	syscall.Exit(1)
}
