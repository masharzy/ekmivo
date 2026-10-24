package checkout

import (
	"context"
	"github.com/masharzy/ekmivo/backend/internal/authz"
	"net/http"
)

// Enforce installed scopes independently of the UI flag. An operator hiding the
// editor must not restore access to previously restricted conversations.
func (s *Service) inboxChannelScope(ctx context.Context, workspace, realm, actor, thread, cap, source string) error {
	var installed bool
	if err := s.Pipeline.Control.QueryRow(ctx, "SELECT to_regclass('public.briofold_member_channel_scopes') IS NOT NULL").Scan(&installed); err != nil {
		return err
	}
	if !installed {
		return nil
	}
	if _, err := s.Pipeline.Control.Exec(ctx, "SELECT briofold_channel_thread($1::uuid,$2,$3::uuid,$4::uuid,$5)", workspace, realm, actor, thread, cap); err != nil {
		return err
	}
	if source != "" {
		var originThread string
		if err := s.Pipeline.Control.QueryRow(ctx, "SELECT thread_id FROM inbox_messages WHERE workspace_id=$1::uuid AND id=$2::uuid", workspace, source).Scan(&originThread); err != nil {
			return err
		}
		_, err := s.Pipeline.Control.Exec(ctx, "SELECT briofold_channel_thread($1::uuid,$2,$3::uuid,$4::uuid,'read')", workspace, realm, actor, originThread)
		return err
	}
	return nil
}

func (s *Service) inboxManageSession(r *http.Request, w, e string) error {
	if err := s.mobileSession(r, w, e); err != nil {
		return err
	}
	cookie, err := r.Cookie("ekmivo-session")
	if err != nil {
		return authz.ErrUnauthorized
	}
	actor, err := s.Auth.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		return err
	}
	_, err = s.Auth.AuthorizeWorkspace(r.Context(), actor, w, authz.Environment(e), authz.InboxManage)
	return err
}
