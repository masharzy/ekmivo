// Export only the authorized, already loaded CRM page. A full-store export
// requires a separate audited server-side cursor; do not imply pagination is
// exhaustive or expose masked fields through an alternate export path.
export type CrmCsvRow={id?:string;name:string;stage:string;temperature:string;tags:string[];assignee:string|null;email?:string;phone?:string};
export type CrmCsvMember={id:string;name:string};

function cell(value:string){
 const sanitized=value.replaceAll('\u0000','');
 const neutral=/^[\s]*[=+\-@\t\r]/.test(sanitized)?"'"+sanitized:sanitized;
 return '"'+neutral.replaceAll('"','""')+'"';
}

export function crmPageCsv(rows:CrmCsvRow[],members:CrmCsvMember[]){
 const names=new Map(members.map(member=>[member.id,member.name]));
 const records=[
  ['Customer ID','Name','Stage','Temperature','Assigned team member','Tags','Email','Phone'],
  ...rows.slice(0,50).map(row=>[
   row.id??'',row.name,row.stage,row.temperature,
   row.assignee?names.get(row.assignee)??'Assigned team member':'Unassigned',
   row.tags.join(' | '),row.email??'',row.phone??''
  ])
 ];
 return '\uFEFF'+records.map(record=>record.map(cell).join(',')).join('\r\n')+'\r\n';
}
