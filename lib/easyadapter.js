var fs = require("fs");
const fetch = require('node-fetch');
const log = (m) => console.log("EasyAdapter> " + m);

module.exports = class easyAdapter {

    constructor(_lambda){
        this.adapterCache = {};
        this.HIGH_PRIORITY = true;
        this.LOW_PRIORITY = false;
        this.lambda = _lambda; 
    }

    #fieldPicker = (obj, path) => {

        return path.split('.').reduce((o, k) => o && o[k], obj);
    }

    #deriveWinner = (matchResult, transfrm) => {    
     
        matchResult.winteam = null;        
        let fPick = this.#fieldPicker;

        if (transfrm.windv == "score_compare"){
            let homeScore = Number(fPick(matchResult, transfrm.windv_h_samp));
            let awayScore = Number(fPick(matchResult, transfrm.windv_a_samp));
            let homeId = fPick(matchResult, transfrm.windv_h_ret);
            let awayId = fPick(matchResult, transfrm.windv_a_ret);
            
            matchResult.winteam = homeScore > awayScore ? homeId : awayId;
            
        } else if (transfrm.windv == "winner_boolean"){
            let homeWin = Number(fPick(matchResult, transfrm.windv_h_samp));
            let awayWin = Number(fPick(matchResult, transfrm.windv_a_samp));
            let homeId = fPick(matchResult, transfrm.windv_h_ret);
            let awayId = fPick(matchResult, transfrm.windv_a_ret);
            
            matchResult.winteam = homeWin == true ? homeId : awayWin == true ? awayId : 0;
        }
        
        var regExp = /[a-zA-Z]/g;
        
        if(regExp.test(matchResult.winteam)){
          
        } else {
          matchResult.winteam = Number(matchResult.winteam);
        }
        
        return matchResult;
    }

    #transverter = (transform, padLen=0, pad="", field, json) =>{    
        let rv = 0, marker="";
        let valueToConvert = this.#fieldPicker(json, field);

        if (padLen>0 && ["literal","none"].includes(transform)) {
            if (valueToConvert.length>padLen){
                padLen = padLen--;
                marker = "!";
            }
            valueToConvert = valueToConvert.toString().substring(0,padLen-1) + marker;
        } 

        if (transform == "int"){
            rv = valueToConvert.toString(16).padStart(padLen,pad);
        } else if (transform == "utchex"){
            rv = parseInt(valueToConvert.toString().substring(0,10).replace(/-/g, ""),10).toString(16).padStart(padLen,pad);
        } else if (transform == "t2"){
            rv = valueToConvert.toString().substring(0,2).padStart(padLen,pad);
        } else if (transform == "t10"){
            rv = valueToConvert.toString().substring(0,10).padStart(padLen,pad);
        }  else if (transform == "none"){ 
            rv = valueToConvert.toString().padStart(padLen,pad);
        }  else if (transform == "literal"){ 
            rv = field;
        }  
        return rv;
    }

    #transformGameData = (dataset, transfrm) =>{
        return transfrm.output.map(m => {
            return this.#transverter(m.$transform, m.$padLen, m.$pad, m.$field, dataset);
        }).reduce((m,c)=>{ m+=c; return m;}, "");
    }

    #loadAdapter = (adapterid) => {
        try{
            if (!this.adapterCache[adapterid]) 
            this.adapterCache[adapterid] = JSON.parse(fs.readFileSync("./json.adapters/" + adapterid + ".ea.json", 'utf8'));
            return JSON.parse(JSON.stringify(this.adapterCache[adapterid]));
        } catch(e) {
            return false;
        }    
    }

    #formatConfigRecords(configRecords, apid){
        return configRecords.reduce((m,o)=>{
            if (!m[o.type]) m[o.type] = [];
            if (o.apid == apid) m[o.type].push(o);
            return m;
        },{});
    }

    #eaOutputMapper = (spec, apiOutputs) => {

        try{
            let finalRes = "";  
            let outputMap = spec.configRecords.filter(cf=>cf.type=="outputMapping").sort((a,b)=>a.sequence - b.sequence);

            outputMap.forEach(mapping => { 
                
                if (mapping.apid == "$literal"){
                    finalRes += mapping.value.$value;
                } 
                else if (mapping.apid == "$compare"){
                    let r = true;

                    for (let i=0;i<mapping.value.$value.length-1;i++){
                        r = r && (apiOutputs[mapping.value.$value[i]] == apiOutputs[mapping.value.$value[i+1]]);
                    }
                    let rr = mapping.value.$pad ? r.toString().padStart(mapping.value.$padLen, mapping.value.$pad) : r.toString();
                    finalRes += rr;
                }     
                else {
                    if (mapping.value.$range){
                        let val = "";
                        
                        if (mapping.value.$range[1] == 0){
                            val += apiOutputs[mapping.apid];
                        } else {
                            val += apiOutputs[mapping.apid].substring(mapping.value.$range[0], mapping.value.$range[1]);
                        }
                        
                        val = mapping.value.$pad ? val.padStart(mapping.value.$padLen, mapping.value.$pad) : val;
                        finalRes += val;
                    } else if (mapping.value.$fullObj){
                        finalRes = apiOutputs[mapping.apid];
                    }
                }
            
            });   

            return finalRes;
        } catch(e){
            log("eaOutputMapper:unhandled:" + e.toString());
        }
    }

    #eaGenerateRequest = (apiRecrd, adapterParms, pathParams, queryParams, authenticator, fStoreInput) => {

        try{
            // Header format backward compatibility
            if (Array.isArray(apiRecrd.urlHeaders)) apiRecrd.urlHeaders = apiRecrd.urlHeaders[0];
            if (Array.isArray(authenticator.headersauth)) authenticator.headersauth = authenticator.headersauth[0];

            let requestUrl = apiRecrd.url, queryStringArr = [];
            let requestHeaders = {...apiRecrd.urlHeaders, ...authenticator.headersauth};
            
            pathParams?.forEach(pp => {
                if (Object.keys(pp).includes("$parmref")){
                    let dat = pp.$range ? adapterParms[pp.$parmref].substring(pp.$range[0], pp.$range[1]) : adapterParms[pp.$parmref];
                    requestUrl = requestUrl + "/" + dat;                       
                }  else if (Object.keys(pp).includes("$literal")){
                    requestUrl = requestUrl + "/" + pp.$literal;
                }
            });               

            if (queryParams?.length > 0) requestUrl += "?";
            
            queryStringArr = queryParams?.map(qp=>{
                let t, useDat, parmNameKey = Object.keys(qp)[0];
                
                if (parmNameKey == "$literal"){
                    t = qp[parmNameKey];
                } else if (parmNameKey == "$authQueryString"){
                    let queryParmRecord = authenticator.queryParamAuth.find(qpa=>Object.keys(qpa)[0] == qp[parmNameKey]);
                    t = qp[parmNameKey] + "=" + queryParmRecord[qp[parmNameKey]];
                } else {
                    if (qp[parmNameKey].id){
                        useDat = adapterParms[qp[parmNameKey].id];  
                        if (qp[parmNameKey].$range) useDat = useDat.substring(qp[parmNameKey].$range[0], qp[parmNameKey].$range[1]); 
                    } else if (qp[parmNameKey].$fStore) {
                        useDat = fStoreInput[qp[parmNameKey].$fStore];
                    }

                    t = parmNameKey + "=" + useDat;                
                }
                return t;                
            });
        
            requestUrl = requestUrl + queryStringArr.join("&");     

            return {
                url: requestUrl,
                opts : { 
                    method: "GET", 
                    headers: requestHeaders 
                }
            }
        } catch (e){
            log("eaGenerateRequest:unhandled:" + e.toString());
        }
    }

    #eaExecuteRequest = async (request) =>{
        try{
            const res = await fetch(request.url, request.opts);        
            return await res.json();
        } catch (e){
            log("eaExecuteRequest:unhandled:" + e.toString());
        }
    }

    #eaTransform = (json, transform) =>{

        try {
            let data = "0", fStoreOutput = {};

            transform?.root?.forEach(level => {
                if (level.idx != -1){
                    json = this.#fieldPicker(json, level.key)[level.idx]; 
                } else {
                    json = this.#fieldPicker(json, level.key);
                }
            });
            
            if (transform.parseRoot) json = JSON.parse(json);        
            if (transform.noTransform) return {data: json};;

            if (transform.store){ 
                transform.store.map(m => {
                    fStoreOutput[m.$fStore] = this.#transverter(m.$transform, m.$padLen, m.$pad, m.$field, json);
                });
            }    
            
            if (transform.windv){
                 
                var gameFinishedSampleFieldValue = this.#fieldPicker(json, transform.gameFinishedSampleField);
                var gameFinished = transform.gameFinishedSampleTriggers.includes(gameFinishedSampleFieldValue);
                if (gameFinished == true){
                    let jsonWithWinner = this.#deriveWinner(json, transform);    
                    data = this.#transformGameData(jsonWithWinner, transform);
                }

            } else {
                data = this.#transformGameData(json, transform);
            }

            return { data, fStoreOutput };
        } catch (e){
            log("eaTransform:unhandled:" + e.toString());
        }
    }

    #runPrioritySection = async (adapter, spec, adapterParms, priority, fStoreInput) => {

        try {
            let dataSets = {}, fStoreOutput = {};
            let specApis = adapter.apis.filter(a=>((!a.priority && priority == false) || a.priority == priority) && spec.objIndex.includes(a.apid));

            const promises = specApis.map(async apiRecrd => {
                let cfg = this.#formatConfigRecords(spec.configRecords, apiRecrd.apid);

                let pathParams = cfg.pathParams?.sort((a,b)=>a.sequence - b.sequence).map(p=>p.value);
                let queryParams = cfg.queryParams?.sort((a,b)=>a.sequence - b.sequence).map(p=>p.value);    

                let authToApply = adapter.authentications.find(au=>au.authid == cfg.authMapping[0].value.$value);
                let transformToApply = adapter.transformers.find(tr=>tr.transformid == cfg.transformMapping[0].value.$value);

                let request = await this.#eaGenerateRequest(apiRecrd, adapterParms, pathParams, queryParams, authToApply, fStoreInput);     
                let jsonData = await this.#eaExecuteRequest(request);
           
                let transformResult = await this.#eaTransform(jsonData, transformToApply);

                dataSets[apiRecrd.apid] = transformResult.data; 
                fStoreOutput = { ...fStoreOutput, ...transformResult.fStoreOutput};
            });

            await Promise.all(promises); 

            return {dataSets, fStoreOutput}; 
        } catch(e) {
            log("runPrioritySection:unhandled" + e.toString());
        }
    }

    #idSupervisor = async (query) => {

        let r = {}, newquery={};
        let fetch_request = { method: "POST", body: JSON.stringify({"matchId": query.matchId}), headers: {"Content-Type": "application/json" }};

        try{
            const res = await fetch(query.idsurl, fetch_request);
            r = await res.json();
            
            newquery = {
                spec: query.spec,
                id1: r.api1MatchId.toString(),
                id2: r.api2MatchId.toString()
            }

        } catch (e){
            log("Unhandled:" + e.toString());
        }

        return newquery;
    }

    easyAdapter = async (adapterin, request) => {
        
        try {
            
            log("easyadapter:init:" + adapterin.adapterid);

            let query = request.data, useQuery = {};

            if (query.idsgw){
                useQuery = await this.#idSupervisor(query);
            } else{
                useQuery = query;
            }

            let adapter = this.lambda ? adapterin : this.#loadAdapter(adapterin)[0];
            if (!adapter) return { jobRunID: 0, data: -1, err: "Missing or malformed adapter document: " + adapterin };    

            let spec = adapter.specs.find(s => s.specid == useQuery.spec);  
            
            let p1Execute = await this.#runPrioritySection(adapter, spec, useQuery, this.HIGH_PRIORITY, undefined);
            let p2Execute = await this.#runPrioritySection(adapter, spec, useQuery, this.LOW_PRIORITY, p1Execute.fStoreOutput);
            let mappedOutput = this.#eaOutputMapper(spec, {...p1Execute.dataSets, ...p2Execute.dataSets});

            let finalRes = {
                jobRunID: 0,
                data: mappedOutput
            };

            log("return:" + adapterin.adapterid + ":output:" + JSON.stringify(mappedOutput));
            log("~");

            return finalRes; 
        } catch (e){
            log("unhandled" + e.toString());
        }
    }

}

