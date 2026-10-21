package knowledge

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
)

func simplePDF(text string) []byte {
	objects := []string{"<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"}
	stream := "BT /F1 12 Tf 20 250 Td (" + text + ") Tj ET"
	objects = append(objects, fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream))
	var result bytes.Buffer
	result.WriteString("%PDF-1.4\n")
	offsets := []int{0}
	for i, object := range objects {
		offsets = append(offsets, result.Len())
		fmt.Fprintf(&result, "%d 0 obj\n%s\nendobj\n", i+1, object)
	}
	xref := result.Len()
	fmt.Fprintf(&result, "xref\n0 %d\n0000000000 65535 f \n", len(offsets))
	for _, offset := range offsets[1:] {
		fmt.Fprintf(&result, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&result, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets), xref)
	return result.Bytes()
}
func TestPDFExtractsRealTextThroughLimitedSubprocess(t *testing.T) {
	if _, err := os.Stat("/usr/bin/pdftotext"); err != nil {
		t.Skip("runtime PDF executable unavailable on this development host")
	}
	if _, err := os.Stat("/usr/bin/prlimit"); err != nil {
		t.Skip("runtime process limiter unavailable")
	}
	text, err := PDF(context.Background(), simplePDF("Orchid delivery takes three days."))
	if err != nil || !strings.Contains(text, "Orchid delivery takes three days.") {
		t.Fatal(text, err)
	}
	for _, data := range [][]byte{[]byte("not PDF"), []byte("%PDF-1.7\nmalformed"), simplePDF("")} {
		if _, err := PDF(context.Background(), data); err == nil {
			t.Fatal("invalid or textless PDF accepted")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := PDF(ctx, simplePDF("Text")); err == nil {
		t.Fatal("cancelled extraction continued")
	}
}

func TestPDFPreservesEmbeddedBengaliUnicodeText(t *testing.T) {
	if _, err := os.Stat("/usr/bin/pdftotext"); err != nil {
		t.Skip("runtime PDF executable unavailable")
	}
	if _, err := os.Stat("/usr/bin/prlimit"); err != nil {
		t.Skip("runtime limiter unavailable")
	}
	data, err := os.ReadFile("testdata/unicode.pdf")
	if err != nil {
		t.Fatal(err)
	}
	text, err := PDF(context.Background(), data)
	if err != nil || !strings.Contains(text, "Orchid delivery বাংলা নীতি") {
		t.Fatal("Unicode PDF extraction changed", text, err)
	}
}
