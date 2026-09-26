import React from 'react'
export function useTheme(){const[light,setLight]=React.useState(()=>localStorage.getItem('server-engine-theme')==='light');function toggle(){const next=!light;setLight(next);localStorage.setItem('server-engine-theme',next?'light':'dark')}return{light,toggle}}
