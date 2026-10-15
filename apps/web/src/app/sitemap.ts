import type {MetadataRoute} from "next";
import {portalPages} from "../lib/developer-portal";
import {developerConfig} from "../lib/server/developer-config";
export default function sitemap():MetadataRoute.Sitemap{const origin=developerConfig.siteOrigin;return [...["","/payment-gateway","/ai-bot","/pricing"].map(path=>({url:origin+path})),...portalPages.map(p=>({url:(developerConfig.portalOrigin||origin)+"/developers"+p.path,alternates:{languages:{en:origin+"/en/developers"+p.path,bn:origin+"/bn/developers"+p.path}}}))];}
