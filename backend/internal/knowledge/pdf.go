package knowledge

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrExtractorUnavailable = errors.New("document extractor unavailable")

type textBuffer struct{ bytes.Buffer }

func (b *textBuffer) Write(data []byte) (int, error) {
	if b.Len()+len(data) > MaxTextBytes {
		return 0, ErrLimit
	}
	return b.Buffer.Write(data)
}

// PDF runs the maintained system parser in a separate, resource-limited process.
// A malformed file cannot spin a Go request goroutine or allocate an unbounded
// parser heap in the API. No database credentials or model keys reach the child.
func PDF(ctx context.Context, data []byte) (string, error) {
	if len(data) == 0 || len(data) > MaxFileBytes || !bytes.HasPrefix(data, []byte("%PDF-")) {
		return "", ErrDocument
	}
	for _, binary := range []string{"/usr/bin/prlimit", "/usr/bin/pdftotext"} {
		if _, err := os.Stat(binary); err != nil {
			return "", ErrExtractorUnavailable
		}
	}
	bounded, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	command := exec.CommandContext(bounded, "/usr/bin/prlimit", "--as=134217728", "--cpu=3", "--nofile=32", "--nproc=16", "--fsize=1048576", "--", "/usr/bin/pdftotext", "-enc", "UTF-8", "-nopgbrk", "-", "-")
	command.Env = []string{"PATH=/usr/bin:/bin", "HOME=/nonexistent", "LANG=C.UTF-8", "LC_ALL=C.UTF-8"}
	command.Stdin = bytes.NewReader(data)
	var output textBuffer
	command.Stdout = &output
	command.Stderr = io.Discard
	if err := command.Run(); err != nil {
		return "", ErrDocument
	}
	text := strings.TrimSpace(output.String())
	if text == "" || !utf8.ValidString(text) || strings.ContainsRune(text, 0) {
		return "", ErrDocument
	}
	return text, nil
}
