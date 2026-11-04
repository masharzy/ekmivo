export type InboxMediaCapabilities={image:boolean;audio:boolean;document:boolean};

export const inboxImageTypes=["image/jpeg","image/png"] as const;
export const inboxAudioTypes=["audio/mpeg","audio/ogg","audio/mp4","audio/aac"] as const;
export const inboxDocumentTypes=["application/pdf","text/plain"] as const;

export function inboxAttachmentAccept(capabilities:InboxMediaCapabilities){
 return [...(capabilities.image?inboxImageTypes:[]),...(capabilities.audio?inboxAudioTypes:[]),...(capabilities.document?inboxDocumentTypes:[])].join(",");
}

export function inboxAttachmentSupported(file:{type:string;size:number},capabilities:InboxMediaCapabilities){
 if(!Number.isInteger(file.size)||file.size<1||file.size>5*1024*1024)return false;
 return (capabilities.image&&(inboxImageTypes as readonly string[]).includes(file.type))||
  (capabilities.audio&&(inboxAudioTypes as readonly string[]).includes(file.type))||
  (capabilities.document&&(inboxDocumentTypes as readonly string[]).includes(file.type));
}
