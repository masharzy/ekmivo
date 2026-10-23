import Link from "next/link";
import {unifiedSettings,enabledUnifiedService,type BusinessMode} from "../lib/unified-navigation";
import styles from "./unified-settings-index.module.css";

export function UnifiedSettingsIndex({locale,mode}:{locale:"en"|"bn";mode:BusinessMode}){
 const bn=locale==="bn";
 return <section className={styles.root} aria-labelledby="unified-settings-title">
  <header className={styles.header}>
   <h1 id="unified-settings-title">{bn?"সেটিংস":"Settings"}</h1>
   <p>{bn?"ব্যবসার প্রয়োজনীয় সংযোগ ও পছন্দ পরিচালনা করুন।":"Manage your business connections and preferences."}</p>
  </header>
  <div className={styles.groups}>{unifiedSettings.map(group=>{
   const items=group.items.filter(item=>enabledUnifiedService(mode,item.service)&&
    (item.slug!=="activity"||mode!=="ai"||process.env.BRIOFOLD_ACTIVITY_UNIFIED_ENABLED==="true")&&
    (item.slug!=="team/groups"||process.env.BRIOFOLD_TEAM_GROUPS_ENABLED==="true"));
   if(!items.length)return null;
   return <details className={styles.group} key={group.slug} open={group.slug==="payment"&&mode!=="ai"}>
    <summary>{group.slug==="payment"&&mode==="ai"?(bn?"ডিভাইস":"Devices"):group[locale]}<span className={styles.count}>{items.length}</span></summary>
    <div className={styles.entries}>{items.map(item=><Link key={item.slug} href={item.external?"/developers":item.slug==="account"?"/account":item.slug==="website"?"/settings/channels/website":"/settings/"+item.slug} prefetch={!item.external}>
     <span>{item[locale]}</span><span className={styles.arrow} aria-hidden="true">→</span>
    </Link>)}</div>
   </details>;
  })}</div>
 </section>;
}
