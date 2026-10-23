package checkout

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"testing"
	"time"
)

// Exercise the real private-upload scanner transport, including all streamed
// bytes. A fictional clean response is not evidence of real malware scanning.
func TestPrivateScannerRequiresCompleteAffirmativeResult(t *testing.T) {
	for _, response := range []string{"stream: OK\x00", "stream: FictionalThreat FOUND\x00", "stream: UNKNOWN\x00"} {
		t.Run(fmt.Sprintf("response-%x", response), func(t *testing.T) {
			listener, err := net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				t.Fatal(err)
			}
			defer listener.Close()
			t.Setenv("PRIVATE_UPLOAD_CLAMD_ADDRESS", listener.Addr().String())
			content := bytes.Repeat([]byte("fictional private upload"), 4000)
			observed := make(chan error, 1)
			go func() {
				conn, err := listener.Accept()
				if err != nil {
					observed <- err
					return
				}
				defer conn.Close()
				_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
				header := make([]byte, 10)
				if _, err = io.ReadFull(conn, header); err != nil || string(header) != "zINSTREAM\x00" {
					observed <- fmt.Errorf("invalid scanner header: %v", err)
					return
				}
				var received []byte
				for {
					var size [4]byte
					if _, err = io.ReadFull(conn, size[:]); err != nil {
						observed <- err
						return
					}
					n := binary.BigEndian.Uint32(size[:])
					if n == 0 {
						break
					}
					if n > 32768 {
						observed <- fmt.Errorf("oversize scanner chunk")
						return
					}
					part := make([]byte, n)
					if _, err = io.ReadFull(conn, part); err != nil {
						observed <- err
						return
					}
					received = append(received, part...)
				}
				if !bytes.Equal(received, content) {
					observed <- fmt.Errorf("scanner did not receive the whole file")
					return
				}
				_, err = conn.Write([]byte(response))
				observed <- err
			}()
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			err = scanFile(ctx, content)
			if (err == nil) != (response == "stream: OK\x00") {
				t.Fatal("scanner accepted an unconfirmed result", response, err)
			}
			select {
			case err = <-observed:
				if err != nil {
					t.Fatal(err)
				}
			case <-ctx.Done():
				t.Fatal("scanner protocol timed out")
			}
		})
	}
}
