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

this.EXPORTED_SYMBOLS = ["SebNet"];

/* Modules */
const 	{ classes: Cc, interfaces: Ci, results: Cr, utils: Cu } = Components,
	{ appinfo } = Cu.import("resource://gre/modules/Services.jsm").Services;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
	
/* Services */

/* SebModules */
XPCOMUtils.defineLazyModuleGetter(this,"sl","resource://modules/SebLog.jsm","SebLog");
XPCOMUtils.defineLazyModuleGetter(this,"su","resource://modules/SebUtils.jsm","SebUtils");

/* ModuleGlobals */
let 	seb = null,
	whiteListRegs =	[],
	blackListRegs = [],
	convertReg = /[-\[\]\/\{\}\(\)\+\?\.\\\^\$\|]/g,
	wildcardReg = /\*/g,
	reqHeader = "",
	reqKey = null,
	reqSalt = null,
	sendBrowserExamKey = null;

this.SebNet = {
	httpRequestObserver : {
		observe	: function(subject, topic, data) {
			if (topic == "http-on-modify-request") {
				//sl.debug(data);
				subject.QueryInterface(Ci.nsIHttpChannel);
				//sl.debug(subject.getRequestHeader('Accept'));
				//sl.debug(subject.referrer);
				let url = subject.URI.spec.split("#"); // url fragment is not transmitted to the server!
				url = url[0];
				sl.debug("request: " + url);
				
				if (!seb.config["urlFilterTrustedContent"]) {
					if (!base.isValidUrl(url)) {
						subject.cancel(Cr.NS_BINDING_ABORTED);
					}
				}					
				//if (sendReqHeader && /text\/html/g.test(subject.getRequestHeader('Accept'))) { // experimental
				if (sendBrowserExamKey) { // experimental
					var k;
					if (reqSalt) {								
						k = base.getRequestValue(url, reqKey);
						sl.debug("get req value: " + url + " : " + reqKey + " = " + k);
					}
					else {
						k = reqKey;
					}
					subject.setRequestHeader(reqHeader, k, false);
				}
				// ToDo: MimeType and file extension detection: if handler exists, hook into the request
			} 
			
		},

		get observerService() {  
			return Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);  
		},
	  
		register: function() {  
			this.observerService.addObserver(this, "http-on-modify-request", false);  
		},  
	  
		unregister: function()  {  
			this.observerService.removeObserver(this, "http-on-modify-request");  
		}  
	},
	
	init : function(obj) {
		base = this;
		seb = obj;
		base.setListRegex();
		base.setReqHeader();
		sl.out("SebNet initialized: " + seb);
	},
	
	setListRegex : function() { // for better performance compile RegExp objects and push them into arrays
		sl.debug("setListRegex"); 
		//sl.debug(typeof seb.config["urlFilterRegex"]);
		let is_regex = (typeof seb.config["urlFilterRegex"] === "boolean") ? seb.config["urlFilterRegex"] : false;
		sl.debug("urlFilterRegex: " + is_regex);
		let b = (typeof seb.config["blacklistURLFilter"] === "object") ? seb.config["blacklistURLFilter"] : false;		
		let w = (typeof seb.config["whitelistURLFilter"] === "object") ? seb.config["whitelistURLFilter"] : false;
			
		if (b) {
			for (var i=0;i<b.length;i++) {
				if (is_regex) {
					blackListRegs.push(new RegExp(b[i]));
				}
				else {
					blackListRegs.push(new RegExp(base.getRegex(b[i])));
				}
			}
		}
		if (w) {
			for (var i=0;i<w.length;i++) {
				if (is_regex) {
					whiteListRegs.push(new RegExp(w[i]));
				}
				else {
					whiteListRegs.push(new RegExp(base.getRegex(w[i])));
				}
			}
		}
	},
	
	getRegex : function (p) {
		var reg = p.replace(convertReg, "\\$&");
		reg = reg.replace(wildcardReg,".*?");
		return reg;
	},
	
	isValidUrl : function (url) {
		if (whiteListRegs.length == 0 && blackListRegs.length == 0) return true;
		var m = false;
		var msg = "";		
		sl.debug("check url: " + url);
		msg = "NOT VALID: " + url + " is not allowed!";							
		for (var i=0;i<blackListRegs.length;i++) {
			if (blackListRegs[i].test(url)) {
				m = true;
				break;
			}
		}
		if (m) {
			sl.debug(msg);				
			return false; 
		}
		if (whiteListRegs.length == 0) {
			return true;
		}
		for (var i=0;i<whiteListRegs.length;i++) {
			if (whiteListRegs[i].test(url)) {
				m = true;
				break;
			}
		}
		if (!m) {								
			sl.debug(msg);
			return false;
		}
		return true;	
	},
	
	setReqHeader : function() {
		sl.debug("setReqHeader");
		sendBrowserExamKey = su.getConfig("sendBrowserExamKey","boolean",false);
		if (!sendBrowserExamKey) { return; }
		let rh = su.getConfig("browserRequestHeader","string","");
		let rk = su.getConfig("browserExamKey","string","");
		let rs = su.getConfig("browserURLSalt","boolean",true);
		
		if (rh != "" && rk != "") {
			reqHeader = rh;
			reqKey = rk;
			reqSalt = rs;
		}
	},
	
	getRequestValue : function (url,key) {
		return su.getHash(url+key);
	}
}