//go:build !windows

package main

import (
	"fmt"
	"os"
)

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, "Timesheet Studio:", msg)
	os.Exit(1)
}
