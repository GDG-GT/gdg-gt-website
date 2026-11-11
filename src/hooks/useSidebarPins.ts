import { useEffect, useState, useCallback } from "react";
export function parseSidebarPins(raw:string|null,allowed:readonly string[]):string[]{
  try{const values:unknown=JSON.parse(raw||"[]");return Array.isArray(values)?[...new Set(values.filter((v):v is string=>typeof v==="string" && allowed.includes(v)))].slice(0,3):[]}catch{return[]}
}
export function toggleSidebarPin(current:string[],path:string):string[]{return current.includes(path)?current.filter(v=>v!==path):current.length<3?[...current,path]:current}
export function useSidebarPins(account:string|undefined,allowed:readonly string[]){
  const key="gdg.workspace.pins.v1:"+(account||"signed-out");
  const read=useCallback(()=>{try{return parseSidebarPins(localStorage.getItem(key),allowed)}catch{return[]}},[key,allowed]);
  const [state,setState]=useState(()=>({key,paths:read()}));
  const pins=state.key===key?state.paths:read();
  useEffect(()=>{setState({key,paths:read()});const sync=(e:StorageEvent)=>{if(e.key===key)setState({key,paths:parseSidebarPins(e.newValue,allowed)})};window.addEventListener("storage",sync);return()=>window.removeEventListener("storage",sync)},[key,read,allowed]);
  useEffect(()=>{if(account &&state.key===key){try{localStorage.setItem(key,JSON.stringify(state.paths))}catch{/* Session-only pinning still works when browser storage is unavailable. */}}},[state,key,account]);
  const toggle=useCallback((path:string)=>{if(!account||!allowed.includes(path))return;setState(previous=>({key,paths:toggleSidebarPin(previous.key===key?previous.paths:read(),path)}))},[account,allowed,key,read]);
  return{pins,toggle};
}
