package receiptnotice

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	"net"
	"net/smtp"
	"strings"
	"time"
)

var ErrOutcomeUnknown = errors.New("notice submission outcome unknown")

// SMTPConfig is operator configuration, never a merchant-supplied destination.
// The transport requires implicit TLS; it never falls back to plaintext.
type SMTPConfig struct {
	Host, Username, Password, From string
	Port                           int
	Timeout                        time.Duration
	RootCAs                        *x509.CertPool // Optional operator/test CA; verification remains mandatory.
}

// MessageID is a persisted outbox identifier, reused across retry attempts.
// Accepted means SMTP accepted responsibility, not delivery to a user's inbox.
type Message struct {
	MerchantRequestedDocument                        bool // Explicit seller-requested invoice; never receipt verification.
	ContactVerification                              bool
	Recipient                                        Recipient
	Workspace, Environment, MessageID, Subject, Text, HTML string
}

func EncodeMessage(c SMTPConfig, m Message, now time.Time) ([]byte, error) {
	from, err := NormalizeEmail(c.From)
	eligible := m.Recipient.Eligible(m.Workspace, m.Environment, now)
	if m.ContactVerification || m.MerchantRequestedDocument {
		r := m.Recipient
		eligible = r.Workspace == m.Workspace && r.Environment == m.Environment &&
			(m.Environment == "sandbox" || m.Environment == "live") && m.Workspace != "" &&
			!r.ConsentedAt.IsZero() && !r.ConsentedAt.After(now) && r.WithdrawnAt.IsZero()
	}
	if err != nil || !eligible {
		return nil, errors.New("notice recipient unavailable")
	}
	to, err := NormalizeEmail(m.Recipient.Email)
	if err != nil || len(m.Subject) == 0 || len(m.Subject) > 200 || strings.ContainsAny(m.Subject, "\r\n") ||
		len(m.Text) > 32000 || len(m.HTML) > 64000 || len(m.MessageID) < 16 || len(m.MessageID) > 80 ||
		strings.ContainsAny(m.MessageID, "\r\n <>@") {
		return nil, errors.New("invalid notice message")
	}
	text := strings.ReplaceAll(strings.ReplaceAll(m.Text, "\r\n", "\n"), "\r", "\n")
	text = strings.ReplaceAll(text, "\n", "\r\n")
	domain := from[strings.LastIndexByte(from, '@')+1:]
	if m.HTML != "" {
		const boundary = "briofold-invoice-alternative"
		encoded := base64.StdEncoding.EncodeToString([]byte(m.HTML))
		var wrapped strings.Builder
		for len(encoded) > 76 {
			wrapped.WriteString(encoded[:76])
			wrapped.WriteString("\r\n")
			encoded = encoded[76:]
		}
		wrapped.WriteString(encoded)
		return []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMessage-ID: <%s@%s>\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=%q\r\n\r\n--%s\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n%s\r\n--%s\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n--%s--\r\n", from, to, mime.QEncoding.Encode("UTF-8", m.Subject), m.MessageID, domain, now.Format(time.RFC1123Z), boundary, boundary, text, boundary, wrapped.String(), boundary)), nil
	}
	return []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMessage-ID: <%s@%s>\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n%s\r\n", from, to, mime.QEncoding.Encode("UTF-8", m.Subject), m.MessageID, domain, now.Format(time.RFC1123Z), text)), nil
}

func SendSMTP(ctx context.Context, c SMTPConfig, m Message) error {
	if c.Host == "" || strings.ContainsAny(c.Host, "\r\n/ :") || c.Port < 1 || c.Port > 65535 ||
		c.Username == "" || c.Password == "" {
		return errors.New("notice transport unavailable")
	}
	body, err := EncodeMessage(c, m, time.Now())
	if err != nil {
		return err
	}
	timeout := c.Timeout
	if timeout <= 0 || timeout > 15*time.Second {
		timeout = 10 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	dialer := tls.Dialer{NetDialer: &net.Dialer{Timeout: timeout}, Config: &tls.Config{ServerName: c.Host, MinVersion: tls.VersionTLS12, RootCAs: c.RootCAs}}
	conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(c.Host, fmt.Sprint(c.Port)))
	if err != nil {
		return errors.New("notice connection failed")
	}
	defer conn.Close()
	deadline, _ := ctx.Deadline()
	if err = conn.SetDeadline(deadline); err != nil {
		return errors.New("notice timeout unavailable")
	}
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	client, err := smtp.NewClient(conn, c.Host)
	if err != nil {
		return errors.New("notice handshake failed")
	}
	defer client.Close()
	if err = client.Auth(smtp.PlainAuth("", c.Username, c.Password, c.Host)); err != nil {
		return errors.New("notice authentication failed")
	}
	from, _ := NormalizeEmail(c.From)
	to, _ := NormalizeEmail(m.Recipient.Email)
	if err = client.Mail(from); err != nil {
		return errors.New("notice sender rejected")
	}
	if err = client.Rcpt(to); err != nil {
		return errors.New("notice recipient rejected")
	}
	w, err := client.Data()
	if err != nil {
		return errors.New("notice submission failed")
	}
	if _, err = w.Write(body); err != nil {
		_ = w.Close()
		return ErrOutcomeUnknown
	}
	if err = w.Close(); err != nil {
		return ErrOutcomeUnknown
	}
	// DATA acceptance is authoritative even if QUIT or connection teardown fails.
	_ = client.Quit()
	return nil
}
