package main

import "testing"
func TestPG04MigrationRequiresIsolatedRealmCredentials(t *testing.T){
 if e:=validateIndependent(
  "postgresql://mig-sandbox:secret@localhost:5432/ekmivo_pg04_sandbox",
  "postgresql://mig-live:secret@localhost:5432/ekmivo_pg04_live");e!=nil{t.Fatal(e)}
 for _,pair:=range [][2]string{
  {"postgresql://owner@localhost/one","postgresql://owner@localhost/two"},
  {"postgresql://owner-a@localhost/shared","postgresql://owner-b@localhost/shared"},
  {"postgresql://owner-a@localhost/ekmivo","postgresql://owner-b@localhost/live"},
  {"invalid","postgresql://owner-b@localhost/live"},
 }{
  if validateIndependent(pair[0],pair[1])==nil{t.Fatalf("accepted unsafe migration pair: %q",pair)}
 }
}
