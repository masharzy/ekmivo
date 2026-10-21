package knowledge

import (
 "archive/zip"
 "bytes"
 "strings"
 "testing"
)
func document(t *testing.T,body string,extra map[string]string)[]byte{
 t.Helper();var data bytes.Buffer;writer:=zip.NewWriter(&data)
 files:=map[string]string{"word/document.xml":body};for k,v:=range extra{files[k]=v}
 for name,content:=range files{file,err:=writer.Create(name);if err!=nil{t.Fatal(err)};if _,err=file.Write([]byte(content));err!=nil{t.Fatal(err)}}
 if err:=writer.Close();err!=nil{t.Fatal(err)};return data.Bytes()
}
func TestWordExtractsUnicodeWithoutFollowingDocumentRelationships(t *testing.T){
 body:=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Orchid delivery</w:t><w:tab/><w:t>৩ দিন</w:t></w:r></w:p><w:p><w:r><w:t>বাংলা warranty</w:t></w:r></w:p></w:body></w:document>`
 value,err:=Word(document(t,body,map[string]string{"word/_rels/document.xml.rels":`<Relationships><Relationship Target="http://169.254.169.254/secrets" TargetMode="External"/></Relationships>`}))
 if err!=nil||value!="Orchid delivery\t৩ দিন\nবাংলা warranty" {t.Fatal(value,err)}
}
func TestWordRejectsMacrosEntitiesTraversalAndExpansionLimits(t *testing.T){
 valid:=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Text</w:t></w:r></w:p></w:body></w:document>`
 for _,data:=range [][]byte{[]byte("not Word"),document(t,valid,map[string]string{"../outside":"bad"}),document(t,valid,map[string]string{"word/vbaProject.bin":"macro"}),document(t,`<!DOCTYPE x [<!ENTITY ex SYSTEM "file:///etc/passwd">]>`+valid,nil),document(t,strings.Replace(valid,"Text",strings.Repeat("x",MaxTextBytes+1),1),nil)}{if _,err:=Word(data);err==nil{t.Fatal("unsafe document accepted")}}
}

func TestWordIncludesHeadersFootersNotesAndTables(t *testing.T){
 ns:=` xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`
 paragraph:=func(root,text string)string{return "<w:"+root+ns+"><w:p><w:r><w:t>"+text+"</w:t></w:r></w:p></w:"+root+">"}
 value,err:=Word(document(t,paragraph("document","Main"),map[string]string{"word/header1.xml":paragraph("hdr","Header"),"word/footer1.xml":paragraph("ftr","Footer"),"word/footnotes.xml":paragraph("footnotes","Notes")}))
 if err!=nil {t.Fatal(err)};for _,part:=range []string{"Main","Header","Footer","Notes"}{if !strings.Contains(value,part){t.Fatal("section omitted",part,value)}}
}
