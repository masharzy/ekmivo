package checkout

import "testing"

func TestMessengerStickerKeepsMetadataAndDeduplicatesPayload(t *testing.T) {
	raw := []byte(`{"object":"page","entry":[{"id":"page","messaging":[{"sender":{"id":"sender"},"timestamp":1700000000000,"message":{"mid":"message","attachments":[{"type":"image","payload":{"url":"https://cdn.fbsbx.com/sticker","sticker_id":369239263222822}},{"type":"sticker","payload":{"url":"https://cdn.fbsbx.com/sticker","sticker_id":369239263222822}}]}}]}]}`)
	media := parseInboxMedia(raw)
	if len(media) != 1 || media[0].Kind != "image" || media[0].StickerID != "369239263222822" || media[0].Message != "message" {
		t.Fatalf("unexpected sticker metadata: %#v", media)
	}
}
