package financial

import(
 "context"
 "errors"
 "fmt"
 "net/url"
 "strings"

 "github.com/jackc/pgx/v5"
 "github.com/jackc/pgx/v5/pgxpool"
)
var ErrStaleProjection=errors.New("stale or denied financial projection")

// ProjectionCoordinator contains only machine-owned DB sessions. It never
// stores passwords/users/memberships in the finance DB; the control DB stays
// authoritative for payment product and per-realm status.
type ProjectionCoordinator struct{
 Control *pgxpool.Pool
 Sandbox *pgxpool.Pool
 Live *pgxpool.Pool
}
func ValidateFinanceSeparation(control,sandbox,live string)error{
 urls:=[]string{control,sandbox,live}
 names:=map[string]bool{}
 users:=map[string]bool{}
 for _,raw:=range urls{
  u,e:=url.Parse(raw)
  if e!=nil||(u.Scheme!="postgres"&&u.Scheme!="postgresql")||u.Host==""||u.User==nil||u.User.Username()==""||
    strings.TrimPrefix(u.Path,"/")==""{return ErrInvalid}
  name:=u.Host+u.Path
  if names[name]||users[u.User.Username()]{return ErrInvalid}
  names[name]=true;users[u.User.Username()]=true
 }
 return nil
}
func (p *ProjectionCoordinator) Sync(ctx context.Context,workspace,realm string)(int64,bool,error){
 if err:=validateScope(workspace,realm);err!=nil{return 0,false,err}
 if p==nil||p.Control==nil||p.Sandbox==nil||p.Live==nil{return 0,false,ErrUnavailable}
 finance:=p.Sandbox
 if realm=="live"{finance=p.Live}
 var id,environment string;var version int64;var enabled bool
 err:=p.Control.QueryRow(ctx,`SELECT workspace_id::text,environment,source_version,active
 FROM resolve_financial_projection($1::uuid,$2)`,workspace,realm).Scan(&id,&environment,&version,&enabled)
 if errors.Is(err,pgx.ErrNoRows){return 0,false,ErrStaleProjection}
 if err!=nil{return 0,false,fmt.Errorf("%w: control source unavailable",ErrUnavailable)}
 if id!=workspace||environment!=realm||version<1{return 0,false,ErrUnavailable}
 var applied bool
 err=finance.QueryRow(ctx,`SELECT financial_sync_workspace($1::uuid,$2,$3,$4)`,
 workspace,realm,version,enabled).Scan(&applied)
 if err!=nil{return 0,false,fmt.Errorf("%w: financial projection write failed",ErrUnavailable)}
 if !applied{return version,enabled,ErrStaleProjection}
 return version,enabled,nil
}

type projectionItem struct{workspace,realm string}
// SyncAll is a bounded operator-owned reconciler. It never copies email,
// sessions, phone numbers or merchant credentials, and re-reads authoritative
// control status immediately before each realm sync.
func (p *ProjectionCoordinator) SyncAll(ctx context.Context)(int,error){
 if p==nil||p.Control==nil||p.Sandbox==nil||p.Live==nil{return 0,ErrUnavailable}
 rows,err:=p.Control.Query(ctx,`SELECT workspace_id::text,environment
 FROM list_financial_projections() ORDER BY workspace_id,environment`)
 if err!=nil{return 0,ErrUnavailable}
 items:=make([]projectionItem,0,64)
 for rows.Next(){
  if len(items)>=10000{rows.Close();return 0,ErrUnavailable}
  var item projectionItem
  if err:=rows.Scan(&item.workspace,&item.realm);err!=nil{rows.Close();return 0,ErrUnavailable}
  items=append(items,item)
 }
 if err:=rows.Err();err!=nil{rows.Close();return 0,ErrUnavailable}
 rows.Close()
 for i,item:=range items{
  if _,_,err:=p.Sync(ctx,item.workspace,item.realm);err!=nil{
   return i,fmt.Errorf("%w: projection reconciliation incomplete",ErrUnavailable)
  }
 }
 return len(items),nil
}
