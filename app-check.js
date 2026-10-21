import {initializeAppCheck,ReCaptchaV3Provider} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app-check.js';
import {APP_CHECK_SITE_KEY} from './app-check-config.js';
const initialized=new Set();
export function protegerApp(app){
 if(!APP_CHECK_SITE_KEY||initialized.has(app.name))return;
 initializeAppCheck(app,{provider:new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),isTokenAutoRefreshEnabled:true});
 initialized.add(app.name);
}
