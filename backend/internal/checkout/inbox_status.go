package checkout

import (
	"encoding/json"
	"strconv"
	"time"
)

type inboxStatusEvent struct {
	Account, Message, Recipient, Status string
	At                                  time.Time
	Watermark                           bool
}

func parseInboxStatuses(raw []byte) []inboxStatusEvent {
	var p struct {
		Entry []struct {
			ID        string `json:"id"`
			Messaging []struct {
				Sender struct {
					ID string `json:"id"`
				} `json:"sender"`
				Delivery *struct {
					MIDs      []string `json:"mids"`
					Watermark int64    `json:"watermark"`
				} `json:"delivery"`
				Read *struct {
					Watermark int64 `json:"watermark"`
				} `json:"read"`
			} `json:"messaging"`
			Changes []struct {
				Value struct {
					Metadata struct {
						Phone string `json:"phone_number_id"`
					} `json:"metadata"`
					Statuses []struct {
						ID        string `json:"id"`
						Status    string `json:"status"`
						Timestamp string `json:"timestamp"`
					} `json:"statuses"`
				} `json:"value"`
			} `json:"changes"`
		} `json:"entry"`
	}
	if json.Unmarshal(raw, &p) != nil {
		return nil
	}
	out := []inboxStatusEvent{}
	for _, e := range p.Entry {
		for _, change := range e.Changes {
			for _, s := range change.Value.Statuses {
				seconds, err := strconv.ParseInt(s.Timestamp, 10, 64)
				if err != nil {
					continue
				}
				status := s.Status
				if status == "read" {
					status = "seen"
				}
				if status != "sent" && status != "delivered" && status != "seen" && status != "failed" {
					continue
				}
				out = append(out, inboxStatusEvent{Account: change.Value.Metadata.Phone, Message: s.ID, Status: status, At: time.Unix(seconds, 0)})
			}
		}
		for _, m := range e.Messaging {
			if m.Delivery != nil {
				for _, id := range m.Delivery.MIDs {
					out = append(out, inboxStatusEvent{Account: e.ID, Message: id, Status: "delivered", At: time.UnixMilli(m.Delivery.Watermark)})
				}
			}
			if m.Read != nil && m.Read.Watermark > 0 {
				out = append(out, inboxStatusEvent{Account: e.ID, Recipient: m.Sender.ID, Status: "seen", At: time.UnixMilli(m.Read.Watermark), Watermark: true})
			}
		}
	}
	return out
}
