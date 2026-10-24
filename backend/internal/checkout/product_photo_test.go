package checkout

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

func photoFixture(c color.NRGBA, size int, jpegFormat bool) []byte {
	im := image.NewNRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			im.SetNRGBA(x, y, c)
		}
	}
	var b bytes.Buffer
	if jpegFormat {
		_ = jpeg.Encode(&b, im, &jpeg.Options{Quality: 85})
	} else {
		_ = png.Encode(&b, im)
	}
	return b.Bytes()
}
func TestProductPhotoFeaturesAreBoundedAndRepeatable(t *testing.T) {
	red := photoFixture(color.NRGBA{R: 255, A: 255}, 32, false)
	a, err := productPhotoFeatures(red)
	if err != nil || a.Hash != strings.Repeat("0", 64) || a.Colors != [3]int{255, 0, 0} {
		t.Fatal("red fixture signature", a, err)
	}
	scaled, err := productPhotoFeatures(photoFixture(color.NRGBA{R: 255, A: 255}, 17, false))
	if err != nil || scaled != a {
		t.Fatal("resize changed a solid signature", scaled, err)
	}
	blue, err := productPhotoFeatures(photoFixture(color.NRGBA{B: 255, A: 255}, 32, true))
	if err != nil || blue.Colors[2] < 250 || blue.Colors[0] > 5 {
		t.Fatal("JPEG color separation failed", blue, err)
	}
	for _, content := range [][]byte{nil, []byte("<svg onload='x'/>"), red[:20], make([]byte, 5*1024*1024+1)} {
		if _, err := productPhotoFeatures(content); err == nil {
			t.Fatal("invalid photo accepted")
		}
	}
	var oversized bytes.Buffer
	_ = png.Encode(&oversized, image.NewNRGBA(image.Rect(0, 0, 4097, 1)))
	if _, err := productPhotoFeatures(oversized.Bytes()); err == nil {
		t.Fatal("oversized dimensions accepted")
	}
}
