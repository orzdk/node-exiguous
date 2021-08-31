console.log("Exiguous> init:please wait...");

const express = require("express")
const cbor = require('cbor')
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const jobs = require("./json.jobs/jobs.json")
const wallet = require('./json.wallet/wallet.ea.json');
const ea = new (require("./lib/easyadapter.js"))();
const blockdb = new (require("./lib/orzdb.js"))("./json.db/block.db.json");
const txdb = new (require("./lib/orzdb.js"))("./json.db/tx.db.json");
const reqdb = new (require("./lib/orzdb.js"))("./json.db/request.db.json");
const oracleRequestEventABI = require("./json.abi/oraclerequest.abi.json")
const oracleFulfillFunctionSig = "0x4ab0d190";
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.WebsocketProvider(wallet.wssurl));
const app = express();
const apiRoutes = express.Router(); 
const port = 1234;
const newid = (x) => [...Array(x)].map(i=>(~~(Math.random()*36)).toString(36)).join('');
const log = (m) => console.log("Exiguous> " + m);

var ignoreKnown = false;
var busy = false;
app.use(express.json())

runLog = () => {

    decodeOracleEvent = (e) => {
        var eParams = {}, cborArr = cbor.decodeAllSync(e.data.replace("0x",""));
        for (let i=0; i<cborArr.length; i+=2){
            eParams[cborArr[i]] = cborArr[i+1];
        }
        return { data: eParams };
    }

    try{
        let startBlock = blockdb.orzdbGet("startBlock");
        if (!startBlock) process.exit(); 

        log("runLog:dbget:startBlock:" + startBlock);
        
        let subscription = web3.eth.subscribe("logs", {fromBlock: startBlock, address: [wallet.oracleAddress], topics: []}, (err,event) => {});

        log("runLog:subscribed");

        subscription.on('data', async eventData => {
            try {
                const jobidbuf = Buffer.from(eventData.topics[1].replace("0x",""), "hex");
                const jobid = jobidbuf.toString();

                log("runLog:event:OracleRequest");

                blockdb.orzdbSet("startBlock", Number(eventData.blockNumber)+1, true);
               
                let event = web3.eth.abi.decodeLog(oracleRequestEventABI.inputs, eventData.data, eventData.topics);

                let warnKnownRequestId = reqdb.orzdbGet(event.requestId) ? event.requestId : undefined;
                let warnKnownTxId = txdb.orzdbGet(eventData.transactionHash) ? eventData.transactionHash : undefined;

                if (warnKnownRequestId){
                   log("runLog:error:known_requestid:" + warnKnownRequestId);
                } else {
                   reqdb.orzdbSet(event.requestId, true, true);
                }

                if (warnKnownTxId){
                   log("runLog:error:known_tx:" + warnKnownTxId);
                   warnKnownTxId = true;
                } else {
                   txdb.orzdbSet(eventData.transactionHash, true, true);
                }

                if (ignoreKnown || (!warnKnownRequestId && !warnKnownTxId)){
                    log("runLog:ethtx:go");
                    let decodedOracleEvent = decodeOracleEvent(event);
                    let eaData = await ea.easyAdapter(jobs[jobid].adapterid, decodedOracleEvent);               
                    ethTx(event, eaData, jobs[jobid].hex);            
                } else {
                    log("runLog:ethtx:skipknown");
                }

                log("runLog:~");
            } catch(e){
                log("runLog:unhandled:" + e.toString());
            }
        });

    } catch (e) {
        log("runLog:init:error");
    }

}

ethTx = (oracleEvent, adapterData, hex) => {

    log("ethTx:event");

    try {

        if (busy){
            log("BUSY. ETHTX REJECTED");
            return;
        }

        busy = true;
        
        const requestId = oracleEvent.requestId.toString();  

        const txData = Buffer.alloc(32);
        const buf = hex ? Buffer.from(adapterData.data.replace("0x",""), "hex") : Buffer.from(adapterData.data);
        buf.copy(txData, txData.length - buf.length);

        const encodingMap = ["bytes32","uint256","address","bytes4","uint256","bytes32"];
        const encodingParms = [
            requestId, 
            oracleEvent.payment, 
            oracleEvent.callbackAddr, 
            oracleEvent.callbackFunctionId, 
            oracleEvent.cancelExpiration, 
            txData
        ];

        web3.eth.getTransactionCount(wallet.adr, (err, nonce) => {

            log("runlog:web3:nonce:" + nonce);

            let encodedFunctionCall = oracleFulfillFunctionSig + web3.eth.abi.encodeParameters(encodingMap, encodingParms).replace("0x","");

            const tx = {
                nonce:    web3.utils.toHex(nonce),
                to:       wallet.oracleAddress,
                value:    web3.utils.toHex(web3.utils.toWei('0', 'ether')),
                gasLimit: web3.utils.toHex(5000000),
                gasPrice: web3.utils.toHex(web3.utils.toWei('10', 'gwei')),
                data:     encodedFunctionCall
            }

            log("ethTx:tx_send...");

            web3.eth.accounts.signTransaction(tx, wallet.pk)
            .then(signedTx => web3.eth.sendSignedTransaction(signedTx.rawTransaction))
            .then(receipt => {
              log("ethTx:tx_receipt:" + receipt.transactionHash); 
              log("ethTx:tx_success:" + receipt.status + ":gas_used:" + receipt.gasUsed );
              log("ethTx:~");
              txdb.orzdbSet(requestId, true, true);
              busy = false;
            }).catch(err => {
                log("ethTx:error:sendSignedTransaction:");
                console.error(err);
                busy = false;
            });

        });

    } catch(e) {
        log("ethTx:unhandled:" + e);
    }

}

api = () => {

    try{
        apiRoutes.post('/:adapterid', async (req, res) => {
            log("api:request" );
            res.json(await ea.easyAdapter(req.params.adapterid, req.body));   
        });

        app.use('/easyadapter', apiRoutes);
        app.listen(port);

        log("api:ready");   
    } catch(e) {
       log("api:error"); 
    }

}

web3.eth.getTransactionCount(wallet.adr, (err, nonce) => {
    runLog();
    api();
});