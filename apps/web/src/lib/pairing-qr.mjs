import qrcode from "./qr-generator.mjs";
export function pairingPayload(token){
 if(typeof token!=="string"||!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(token))throw Error("INVALID_PAIRING_CODE");
 return "briofold://pair?token="+encodeURIComponent(token);
}
export function pairingSvg(token){
 const qr=qrcode(0,"M");qr.addData(pairingPayload(token));qr.make();
 // Five quiet-zone modules, explicit square size, opaque light background.
 return qr.createSvgTag({cellSize:5,margin:25,scalable:false});
}
