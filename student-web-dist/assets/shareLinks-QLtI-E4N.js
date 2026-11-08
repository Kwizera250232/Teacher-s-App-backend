import{U as d}from"./index-BFmne7gi.js";function l(){var n;return typeof window<"u"&&((n=window.location)!=null&&n.origin)?window.location.origin.replace(/\/$/,""):String("https://student.umunsi.com").replace(/\/$/,"")}function p(t,n){if(!n)return null;const e=(d||"https://studentapi.umunsi.com").replace(/\/$/,""),o=String(n).replace(/^\//,"");return`${e}/download/${t}/${o}`}function $(t,n,e="student"){const o=l(),r=e==="teacher"||e==="head_teacher"?"/teacher/classes":"/student/classes",s=n?`?tab=${encodeURIComponent(n)}`:"";return`${o}${r}/${t}${s}`}function f({title:t,description:n,fileKind:e,filePath:o,classId:r,tab:s,role:a="student"}){const c=e&&o?p(e,o):null,u=c||(r?$(r,s,a):typeof window<"u"?window.location.href:"https://student.umunsi.com"),i=n||t||"UClass";return{title:t,url:u,text:c?`${i}

Open document:
${c}`:`${i}

${u}`}}export{f as b,l as p};
