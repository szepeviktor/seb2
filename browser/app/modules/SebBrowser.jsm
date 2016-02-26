/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the browser component of seb.
 *
 * The Initial Developer of the Original Code is Stefan Schneider <schneider@hrz.uni-marburg.de>.
 * Portions created by the Initial Developer are Copyright (C) 2005
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Stefan Schneider <schneider@hrz.uni-marburg.de>
 *   
 * ***** END LICENSE BLOCK ***** */

/* ***** GLOBAL seb SINGLETON *****

* *************************************/ 

/* 	for javascript module import
	see: https://developer.mozilla.org/en/Components.utils.import 
*/

this.EXPORTED_SYMBOLS = ["SebBrowser"];

/* Modules */
const 	{ classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components,
	{ prompt, scriptloader } = Cu.import("resource://gre/modules/Services.jsm").Services;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

/* Services */
let	wpl = Ci.nsIWebProgressListener,
	wnav = Ci.nsIWebNavigation,
	ovs = Cc["@mozilla.org/security/certoverride;1"].getService(Ci.nsICertOverrideService);

/* SebGlobals */
scriptloader.loadSubScript("resource://globals/prototypes.js");
scriptloader.loadSubScript("resource://globals/const.js");

/* SebModules */
XPCOMUtils.defineLazyModuleGetter(this,"su","resource://modules/SebUtils.jsm","SebUtils");
XPCOMUtils.defineLazyModuleGetter(this,"sl","resource://modules/SebLog.jsm","SebLog");
XPCOMUtils.defineLazyModuleGetter(this,"sw","resource://modules/SebWin.jsm","SebWin");
XPCOMUtils.defineLazyModuleGetter(this,"sn","resource://modules/SebNet.jsm","SebNet");
XPCOMUtils.defineLazyModuleGetter(this,"sh","resource://modules/SebHost.jsm","SebHost");
XPCOMUtils.defineLazyModuleGetter(this,"sg","resource://modules/SebConfig.jsm","SebConfig");
XPCOMUtils.defineLazyModuleGetter(this,"sc","resource://modules/SebScreenshot.jsm","SebScreenshot");

/* ModuleGlobals */
let 	base = null,
	seb = null,
	certdb = null,
	certdb2 = null,
	loadFlag = null,
	startDocumentFlags = wpl.STATE_IS_REQUEST | wpl.STATE_IS_DOCUMENT | wpl.STATE_START,
	stopDocumentFlags = wpl.STATE_IS_WINDOW | wpl.STATE_STOP,
	startNetworkFlags = wpl.STATE_IS_NETWORK | wpl.STATE_IS_DOCUMENT | wpl.STATE_START,
	stopNetworkFlags = wpl.STATE_IS_NETWORK | wpl.STATE_IS_WINDOW | wpl.STATE_STOP,
	wplFlag = { //nsIWebProgressListener state transition flags
	    STATE_START: wpl.STATE_START,
	    STATE_STOP: wpl.STATE_STOP,
	    STATE_REDIRECTING: wpl.STATE_REDIRECTING,
	    STATE_TRANSFERRING: wpl.STATE_TRANSFERRING,
	    STATE_NEGOTIATING: wpl.STATE_NEGOTIATING,
	    STATE_IS_REQUEST: wpl.STATE_IS_REQUEST,
	    STATE_IS_DOCUMENT: wpl.STATE_IS_DOCUMENT,
	    STATE_IS_NETWORK: wpl.STATE_IS_NETWORK,
	    STATE_RESTORING: wpl.STATE_RESTORING,
	    LOCATION_CHANGE_SAME_DOCUMENT: wpl.LOCATION_CHANGE_SAME_DOCUMENT,
	    LOCATION_CHANGE_ERROR_PAGE: wpl.LOCATION_CHANGE_ERROR_PAGE,
	},
	mimeTypesRegs = {
		flash : new RegExp(/^application\/x-shockwave-flash/),
		pdf : new RegExp(/^application\/(x-)?pdf/)
	};
	
const	nsIX509CertDB = Ci.nsIX509CertDB,
	nsIX509CertDB2 = Ci.nsIX509CertDB2,
	nsX509CertDB = "@mozilla.org/security/x509certdb;1",
	DOCUMENT_BLOCKER = "about:document-onload-blocker",
	CERT_SSL = 0,
	CERT_USER = 1, //reserved to windows host
	CERT_CA = 2,
	CERT_SSL_DEBUG = 3;

function nsBrowserStatusHandler() {};
nsBrowserStatusHandler.prototype = {
	isStarted : false,
	win : null,
	baseurl : null,
	onStateChange : function(aWebProgress, aRequest, aStateFlags, aStatus) {},
	onStatusChange : function(aWebProgress, aRequest, aStatus, aMessage) {},
	onProgressChange : function(aWebProgress, aRequest, aCurSelfProgress,
							  aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
	},
	onSecurityChange : function(aWebProgress, aRequest, state) {
	},
	onLocationChange : function(aWebProgress, aRequest, aLocation) {
	},
	QueryInterface : function(aIID) {
			if (aIID.equals(Ci.nsIWebProgressListener) ||
			aIID.equals(Ci.nsISupportsWeakReference) ||
			aIID.equals(Ci.nsIXULBrowserWindow) ||
			aIID.equals(Ci.nsISupports)) {
			return this;
		}
		throw Cr.NS_NOINTERFACE;
	},
	setJSStatus : function(status) {},  
	setJSDefaultStatus : function(status) {},
	setOverLink : function(link) {}
}

this.SebBrowser = {
	//lastDocumentUrl : null,
	init : function(obj) {
		base = this;
		seb = obj;
		certdb = Cc[nsX509CertDB].getService(nsIX509CertDB);
		//base.disableBuiltInCerts();
		sl.out("SebBrowser initialized: " + seb);
	},
	
	stateListener : function(aWebProgress, aRequest, aStateFlags, aStatus) {
		//sl.err(aRequest.name);
		if ((aStateFlags & startDocumentFlags) == startDocumentFlags) { // start document request event
			this.isStarted = true;
			this.win = sw.getChromeWin(aWebProgress.DOMWindow);
			this.baseurl = btoa(aRequest.name);
			
			//this.win = sw.lastWin;
			
			/*
			if (this.win !== sw.getChromeWin(aWebProgress.DOMWindow)) {
				sl.debug("strange: this.win != sw.getChromeWin(aWebProgress.DOMWindow");
			}
			*/
			 
			sl.debug("DOCUMENT REQUEST START: " + aRequest.name + " status: " + aStatus);
			sl.debug("baseurl: " + this.baseurl);
			//this.win.document.getElementsByTagName("window")[0].setAttribute("baseurl",baseurl);
			base.startLoading(this.win);
			if (seb.quitURL === aRequest.name) {
				aRequest.cancel(aStatus);
				base.stopLoading();
				var tmpQuit = seb.allowQuit; // store default shutdownEnabled
				var tmpIgnorePassword = seb.quitIgnorePassword; // store default quitIgnorePassword
				seb.allowQuit = true; // set to true
				seb.quitIgnorePassword = true;
				seb.quit();									
				seb.allowQuit = tmpQuit; // set default shutdownEnabled
				seb.quitIgnorePassword = tmpIgnorePassword; // set default shutdownIgnorePassword
				return;
			}
			if (!sn.isValidUrl(aRequest.name)) {
				aRequest.cancel(aStatus);
				base.stopLoading();
				prompt.alert(seb.mainWin, su.getLocStr("seb.title"), su.getLocStr("seb.url.blocked"));
				return 1; // 0?
			}
			// PDF Handling
			// don't trigger if pdf is part of the query string: infinite loop
			// don't trigger from pdfViewer itself: infinite loop
			if (su.getConfig("sebPdfJsEnabled","boolean", true) && /^[^\?]+\.pdf$/i.test(aRequest.name) && !sw.winTypesReg.pdfViewer.test(aRequest.name)) {
				sl.debug("pdf start request");
				aRequest.cancel(aStatus);
				sw.openPdfViewer(aRequest.name);
				base.stopLoading();
				return;
			} 
		}
		if ((aStateFlags & stopDocumentFlags) == stopDocumentFlags) { // stop document request event
			sl.debug("DOCUMENT REQUEST STOP: " + aRequest.name + " - status: " + aStatus); 
			if (!Components.isSuccessCode(aStatus) && aStatus != 2152398850) { // heise.de with all that advertising will not load without that skipped 2152398850 status
			//if (aStatus > 0 && aStatus != 2152398850) { // error: experimental!!! ToDo: look at status codes!!
				sl.debug("Error document loading: " + aStatus);
				base.stopLoading();
				try {
					try {
						aRequest.QueryInterface(Ci.nsIHttpChannel); // no pdf mimetype handling
						let mimeType = aRequest.getResponseHeader("Content-Type");
						if (mimeTypesRegs.pdf.test(mimeType) && !/\.pdf$/i.test(aRequest.name) && su.getConfig("sebPdfJsEnabled","boolean", true)) { // pdf file requests should already catched by SebBrowser
							sl.debug("request already aborted by httpResponseObserver, no error page!");
							this.isStarted = false;
							return 0;
						}	
					}
					catch (e) { // there is no getResponseHeader function
						switch (e.name) {
							case "NS_ERROR_NOT_AVAILABLE" :
								sl.debug("handled: NS_ERROR_NOT_AVAILABLE");
								break;
							default: 
								sl.debug("not handled: " + e);
						}
					}
					aRequest.cancel(aStatus);
					
					this.win.setTimeout(function() {
						if (!this.isStarted) { // no new start request until now (capturing double clicks on links: experimental)
							let flags = wnav.LOAD_FLAGS_BYPASS_HISTORY; // does not work??? why???
							//win.content.document.location.assign("chrome://seb/content/error.xhtml?req=" + btoa(aRequest.name));
							this.XulLibBrowser.webNavigation.loadURI("chrome://seb/content/error.xhtml?req=" + btoa(aRequest.name), flags, null, null, null);
							this.XULBrowserWindow.isStarted = false;
						}
					}, 100);
					return 0;
				}
				catch(e) {
					sl.debug(e);
				}
				finally {
					aRequest.cancel(aStatus);
					this.isStarted = false;
					return 1;
				}
			}
			
			base.stopLoading();
			this.isStarted = false;
			var w = aWebProgress.DOMWindow.wrappedJSObject;
			try {
				this.win.document.title = this.win.content.document.title;
			}
			catch(e) {
				sl.debug(e);
			}
			if (this.win === seb.mainWin && su.getConfig("sebScreenshot","boolean",false)) {
				sc.createScreenshotController(w);
			}
			if (su.getConfig("enableBrowserWindowToolbar","boolean",false)) {
				base.refreshNavigation(this.win);
			}
			if (su.getConfig("browserScreenKeyboard","boolean",false)) {
				sh.createScreenKeyboardController(this.win);
			}
		}
	},
	
	locationListener : function(aProgress, aRequest, aURI, aFlag) {},
	
	progressListener : function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot) {},
	
	statusListener : function(aWebProgress, aRequest, aStatus, aMessage) {
		if (aStatus) {
			//sl.debug("status: " + aStatus + " : " + aMessage);
		}	
	},
	
	securityListener : function(aWebProgress, aRequest, aState) {},
	
	getBrowser : function (win) {
		try { return win.document.getElementById("seb.browser"); }
		catch(e) { sl.err(e) }
	},
	
	setBrowserHandler : function setBrowserHandler(win) { // Event handler for both wintypes
		sl.debug("setBrowserHandler");
		try {
			win.XULBrowserWindow.onStateChange = base.stateListener;
			win.XULBrowserWindow.onLocationChange = base.locationListener;
			win.XULBrowserWindow.onProgressChange = base.progressListener;
			win.XULBrowserWindow.onStatusChange = base.statusListener;
			win.XULBrowserWindow.onSecurityChange = base.securityListener;
		}
		catch(e) {
			sl.err("Error in setBrowserListener: " + e);
		}
	},
	
	initBrowser : function (win) {
		if (!win) {
			sl.err("wrong arguments for initBrowser(win)");
			return false;
		}
		var br = base.getBrowser(win);
		
		if (!br) {
			sl.debug("no seb.browser in ChromeWindow!");
			return false;
		}	
		win.XulLibBrowser = br; // extend window property to avoid multiple getBrowser() calls
		win.XULBrowserWindow = new nsBrowserStatusHandler();
		// hook up UI through progress listener
		var interfaceRequestor = win.XulLibBrowser.docShell.QueryInterface(Ci.nsIInterfaceRequestor);
		var webProgress = interfaceRequestor.getInterface(Ci.nsIWebProgress);
		webProgress.addProgressListener(win.XULBrowserWindow, Ci.nsIWebProgress.NOTIFY_ALL);
		//nav = win.XulLibBrowser.webNavigation;
		sl.debug("initBrowser");
	},
	
	initSecurity : function () {
		if (su.getConfig("sebDisableOCSP","boolean",true)) {
			sg.setPref("security.OCSP.enabled",0);
		}
		else {
			sg.setPref("security.OCSP.enabled",1);
		}
		switch (su.getConfig("sebSSLSecurityPolicy","number",SSL_SEC_BLOCK_MIXED_ACTIVE)) {
			case SSL_SEC_NONE : // allow mixed content
				sg.setPref("security.mixed_content.block_active_content",false);
				sg.setPref("security.mixed_content.block_display_content",false);
				break;
			case SSL_SEC_BLOCK_MIXED_ACTIVE :
				sg.setPref("security.mixed_content.block_active_content",true);
				sg.setPref("security.mixed_content.block_display_content",false);
				break;
			case SSL_SEC_BLOCK_MIXED_ALL :
				sg.setPref("security.mixed_content.block_active_content",true);
				sg.setPref("security.mixed_content.block_display_content",true);
				break;
		}
		if (su.getConfig("pinEmbeddedCertificates","boolean",false)) {
			base.disableBuiltInCerts();
		}
	},
	
	addSSLCert : function(cert,debug) {
		try {
			
			let flags = (debug) ? ovs.ERROR_UNTRUSTED | ovs.ERROR_MISMATCH | ovs.ERROR_TIME : ovs.ERROR_UNTRUSTED;
			let x509 = certdb.constructX509FromBase64(cert.certificateData);
			//certlist.addCert(x509); // maybe needed for type 1 Identity Certs
			let cn = (debug && cert.overrideCN) ? cert.overrideCN : x509.commonName;
			let host = cn;
			let port = 443;
			let fullhost = cn.split(":");
			if (fullhost.length==2) {
				host = fullhost[0];
				port = parseInt(fullhost[1]);
			}
			ovs.rememberValidityOverride(host,port,x509,flags,true);
			sl.debug("add debug ssl cert: " + host + ":" + port);
		}
		catch (e) { sl.err(e); }
	},
	
	addCert : function(cert,type) {
		try {
			let t = "";
			let trustargs = "";
			let certData = (cert.certificateDataBase64 != "") ? cert.certificateDataBase64 : cert.certificateDataWin;
			let x509 = certdb.constructX509FromBase64(certData);
			if (su.getConfig("allCARootTrust", "boolean", false)) {
				sl.debug("treat all CA certs as root");
				t = "CA";
				trustargs = "C,,";
			}
			else {
				switch (x509.getChain().length) { // experimental
					case 1 : // Root CA
						t = "ROOT CA";
						trustargs = "C,,";
					break;
					default : // Intermediate CA
						t = "INTERMEDIATE CA";
						trustargs = 'c,,';
					}
			}
			sl.debug("add Cert: " + t);
			sl.debug("cert subject: " + x509.subjectName);
			sl.debug("cert cn: "+ x509.commonName);
			sl.debug("cert org: "+ x509.organization);
			sl.debug("cert issuer: "+ x509.issuerName);
			var cdb = Cc["@mozilla.org/security/x509certdb;1"].getService(Ci.nsIX509CertDB);
			var certdb2 = cdb;
			try {
				certdb2 = Cc["@mozilla.org/security/x509certdb;1"].getService(Ci.nsIX509CertDB2);
			} catch (e) {}
			certdb2.addCertFromBase64(certData, trustargs, x509.commonName);
		}
		catch (e) { sl.err(e); }
	},
	
	setEmbeddedCerts : function() {
		let certs = seb.config["embeddedCertificates"];
		if ( typeof certs != "object") { return; }
		sl.debug("setEmbeddedCerts");
		for (var i=0;i<certs.length;i++) {
			switch (certs[i].type) {
				case CERT_CA :
					base.addCert(certs[i],certs[i].type);
					break;
				case CERT_SSL :
					base.addSSLCert(certs[i],fale);
					break;
				case CERT_SSL_DEBUG :
					base.addSSLCert(certs[i],true);
					break;
			}
		}
	},
	
	disableBuiltInCerts : function () {
		let certs = certdb.getCerts();
		let enumerator = certs.getEnumerator();
		while (enumerator.hasMoreElements()) {
			let cert = enumerator.getNext().QueryInterface(Ci.nsIX509Cert);
			//let sslTrust = certdb.isCertTrusted(cert, Ci.nsIX509Cert.CA_CERT, Ci.nsIX509CertDB.TRUSTED_SSL);
			//let emailTrust = certdb.isCertTrusted(cert, Ci.nsIX509Cert.CA_CERT, Ci.nsIX509CertDB.TRUSTED_EMAIL);
			//let objsignTrust = certdb.isCertTrusted(cert, Ci.nsIX509Cert.CA_CERT, Ci.nsIX509CertDB.TRUSTED_OBJSIGN);
			certdb.setCertTrust(cert, Ci.nsIX509Cert.CA_CERT, Ci.nsIX509Cert.CERT_NOT_TRUSTED);
			/*
			sl.debug("issuer: " + cert.issuerName + "\n");
			sl.debug("serial: " + cert.serialNumber + "\n");
			sl.debug("trust:\n");
			sl.debug("  SSL:\t\t" + sslTrust + "\n");
			sl.debug("  EMAIL:\t" + emailTrust + "\n");
			sl.debug("  OBJSIGN:\t" + objsignTrust + "\n");
			*/ 
		}
	},
	
	loadPage : function (win,url,flag) {	// only use for real http requests
		sl.debug("try to load: " + url);
		win.content.document.location.href = url;
	},
	
	reload : function (win) {
		sl.debug("try reload...");
		if (!win.XulLibBrowser) {
			sl.err("no xullib.browser in ChromeWindow!");
			return false;
		}
		win.XulLibBrowser.webNavigation.reload(wnav.LOAD_FLAGS_BYPASS_CACHE);
	},
	
	restart : function() {
		if (!su.getConfig("mainBrowserRestart","boolean",true)) {
			sl.debug("restart not allowed.");
			return;
		}
		sl.debug("restart...");
		sw.removeSecondaryWins();
		let url = su.getUrl();
		//sw.showLoading(seb.mainWin);
		base.loadPage(seb.mainWin,url);
	},
	
	hostRestartUrl : function () {
		let url = su.getConfig("restartExamURL","string","");
		if (url == "") {
			sl.err("no restart url from host");
			return;
		}
		sl.debug("host restart url: " + url);
		sw.removeSecondaryWins();
		//sw.showLoading(seb.mainWin);
		base.loadPage(seb.mainWin,url);
	},
	
	load : function() {
		//mainBrowserLoad
		//mainBrowserLoadReferrer
		sl.debug("try to load from command...");
		let loadUrl = su.getConfig("mainBrowserLoad","string","");
		let loadReferrerInString = su.getConfig("mainBrowserLoadReferrerInString","string","");
		if (loadUrl == "") {
			sl.debug("no mainBrowserLoad defined.");
			return;
		}
		let doc = seb.mainWin.content.document;
		let loadReferrer = doc.location.href;
		if (loadReferrerInString != "") {
			if (loadReferrer.indexOf(loadReferrerInString) > -1) {
				base.loadPage(seb.mainWin,loadUrl);
			}
			else {
					
				sl.debug("loading \"" + loadUrl + "\" is only allowed if string in referrer: \"" + loadReferrerInString + "\"");
				return false;
			}
		}
		else {
			sl.debug("load from command " + loadUrl);
			base.loadPage(seb.mainWin,loadUrl);
		}
	},
	
	startLoading : function(win) {
		try {
			win = (win) ? win : seb.mainWin;
			win.document.getElementById('loadingBox').className = "visible";
		}
		catch (e) {
			sl.debug("error startLoading: " + e);
		}
	},
	
	stopLoading : function() { // stop loading on all windows 
		try {
			for (var i=0;i<sw.wins.length;i++) {
				sw.wins[i].document.getElementById('loadingBox').className = "hidden";
			}	
		}
		catch (e) {
			sl.debug("error stopLoading: " + e);
		}
	}, 
	
	back : function(win) {
		var nav = win.XulLibBrowser.webNavigation;
		if (!su.getConfig("allowBrowsingBackForward","boolean",false)) {
			sl.debug("navigation: back not allowed")
			return; 
		}
		if (nav.canGoBack) {
			sl.debug("navigation: back");	
			nav.goBack();
		}
	},
	
	forward : function(win) {
		var nav = win.XulLibBrowser.webNavigation;
		if (!su.getConfig("allowBrowsingBackForward","boolean",false)) { 
			sl.debug("navigation: forward not allowed");	
			return; 
		}
		if (nav.canGoForward) {
			sl.debug("navigation: forward");	
			nav.goForward();
		}		
	},
	
	refreshNavigation : function(win) {
		sl.debug("refreshNavigation");
		var nav = win.XulLibBrowser.webNavigation;
		if (su.getConfig("allowBrowsingBackForward","boolean",false)) { // should be visible
			var back = win.document.getElementById("btnBack");
			var forward = win.document.getElementById("btnForward");
			if (nav.canGoBack) {
				sl.debug("canGoBack");
				back.className = "tbBtn enabled";
				//back.addEventListener("click",base.back,false);
			}
			else {
				back.className = "tbBtn disabled";
				//back.removeEventListener("click",base.back,false);
			}
			if (nav.canGoForward) {
				sl.debug("canGoForward");
				forward.className = "tbBtn enabled";
				//forward.addEventListener("click",base.forward,false);
			}
			else {
				forward.className = "tbBtn disabled";
				//forward.removeEventListener("click",base.forward,false);
			}
		}
	}
}
