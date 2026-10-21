// Package knowledge extracts bounded untrusted business documents as plain text.
// It never executes document macros, resolves relationships or fetches URLs.
package knowledge

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"path"
	"sort"
	"strings"
	"unicode/utf8"
)

var ErrDocument = errors.New("unsupported or invalid document")
var ErrLimit = errors.New("document exceeds extraction limit")

const MaxFileBytes = 5 * 1024 * 1024
const MaxTextBytes = 100000

func Word(data []byte) (string, error) {
	if len(data) == 0 || len(data) > MaxFileBytes {
		return "", ErrLimit
	}
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", ErrDocument
	}
	if len(reader.File) > 2000 {
		return "", ErrLimit
	}
	var main *zip.File
	var sections []*zip.File
	var expanded uint64
	for _, file := range reader.File {
		if strings.Contains(file.Name, "\\") || strings.HasPrefix(file.Name, "/") || strings.HasPrefix(file.Name, "../") || file.Name == ".." || path.Clean(file.Name) != strings.TrimSuffix(file.Name, "/") || file.Flags&1 != 0 {
			return "", ErrDocument
		}
		if file.UncompressedSize64 > 20*1024*1024-expanded {
			return "", ErrLimit
		}
		expanded += file.UncompressedSize64
		if file.Name == "word/document.xml" {
			if main != nil {
				return "", ErrDocument
			}
			main = file
		}
		base := path.Base(file.Name)
		if path.Dir(file.Name) == "word" && (base == "footnotes.xml" || base == "endnotes.xml" || ((strings.HasPrefix(base, "header") || strings.HasPrefix(base, "footer")) && strings.HasSuffix(base, ".xml"))) {
			sections = append(sections, file)
		}
		if file.Name == "word/vbaProject.bin" {
			return "", ErrDocument
		}
	}
	if main == nil || main.UncompressedSize64 > 2*1024*1024 {
		return "", ErrDocument
	}
	sort.Slice(sections, func(i, j int) bool { return sections[i].Name < sections[j].Name })
	sections = append([]*zip.File{main}, sections...)
	var text strings.Builder
	for _, section := range sections {
		if section.UncompressedSize64 > 2*1024*1024 {
			return "", ErrLimit
		}
		stream, err := section.Open()
		if err != nil {
			return "", ErrDocument
		}
		body, readErr := io.ReadAll(io.LimitReader(stream, 2*1024*1024+1))
		closeErr := stream.Close()
		if readErr != nil || closeErr != nil || len(body) > 2*1024*1024 {
			return "", ErrLimit
		}
		if err := wordXML(body, &text); err != nil {
			return "", err
		}
	}
	result := strings.TrimSpace(text.String())
	if result == "" || !utf8.ValidString(result) || strings.ContainsRune(result, 0) {
		return "", ErrDocument
	}
	return result, nil
}
func wordXML(body []byte, text *strings.Builder) error {
	decoder := xml.NewDecoder(bytes.NewReader(body))
	capture := false
	depth := 0
	validRoot := false
	wordNS := func(space string) bool {
		return space == "http://schemas.openxmlformats.org/wordprocessingml/2006/main" || space == "http://purl.oclc.org/ooxml/wordprocessingml/main"
	}
	appendText := func(value string) error {
		if text.Len()+len(value) > MaxTextBytes {
			return ErrLimit
		}
		text.WriteString(value)
		return nil
	}
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return ErrDocument
		}
		switch value := token.(type) {
		case xml.Directive:
			return ErrDocument
		case xml.StartElement:
			depth++
			if depth > 100 {
				return ErrLimit
			}
			if depth == 1 {
				validRoot = wordNS(value.Name.Space) && (value.Name.Local == "document" || value.Name.Local == "hdr" || value.Name.Local == "ftr" || value.Name.Local == "footnotes" || value.Name.Local == "endnotes")
			}
			if wordNS(value.Name.Space) {
				if value.Name.Local == "t" {
					capture = true
				}
				if value.Name.Local == "tab" {
					if appendText("\t") != nil {
						return ErrLimit
					}
				}
				if value.Name.Local == "br" {
					if appendText("\n") != nil {
						return ErrLimit
					}
				}
			}
		case xml.EndElement:
			if wordNS(value.Name.Space) {
				if value.Name.Local == "t" {
					capture = false
				}
				if value.Name.Local == "p" {
					if appendText("\n") != nil {
						return ErrLimit
					}
				}
			}
			depth--
		case xml.CharData:
			if capture {
				if appendText(string(value)) != nil {
					return ErrLimit
				}
			}
		}
	}
	if !validRoot {
		return ErrDocument
	}
	return nil
}
