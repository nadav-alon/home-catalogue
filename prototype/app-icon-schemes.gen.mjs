import {argbFromHex,hexFromArgb,Hct,SchemeTonalSpot,SchemeFidelity,SchemeContent,MaterialDynamicColors as M} from '@material/material-color-utilities';
const seeds={A:'#0d9488',B:'#e8590c',C:'#8e3a8e'};
const roles=['primary','onPrimary','primaryContainer','onPrimaryContainer','secondaryContainer','onSecondaryContainer','surface','surfaceContainer','onSurface','onSurfaceVariant','outlineVariant','tertiaryContainer','onTertiaryContainer'];
const K={TonalSpot:SchemeTonalSpot,Fidelity:SchemeFidelity,Content:SchemeContent};
const out={};
for(const [v,s] of Object.entries(seeds)){out[v]={seed:s,schemes:{}};for(const [n,C] of Object.entries(K)){out[v].schemes[n]={};for(const dark of [false,true]){const sc=new C(Hct.fromInt(argbFromHex(s)),dark,0);const r={};for(const k of roles)r[k]=hexFromArgb(M[k].getArgb(sc));out[v].schemes[n][dark?'dark':'light']=r;}}}
console.log(JSON.stringify(out));
