const fetch = require('node-fetch');
const moment = require('moment');
const fs = require("fs");

const wait = (ms) => new Promise((resolve, reject) => setTimeout(resolve, ms));

const rapidapiHeaders = {
    "method": "GET",
    "headers":{
        "x-rapidapi-key": "31d5d6cdb6mshc0b9afeb170180bp18aefcjsnc5c0059d7e03",
        "x-rapidapi-host" : "api-basketball.p.rapidapi.com"
    } 
}

const rapidapiHeadersLiveScore = {
    "method": "GET",
    "headers":{
        "x-rapidapi-host": "livescore-basketball.p.rapidapi.com",
        "x-rapidapi-key": "31d5d6cdb6mshc0b9afeb170180bp18aefcjsnc5c0059d7e03"
    }
}

function fubarDateToUTC(dtt){

	let ymd = dtt.toString().substring(0,8);
	let y = dtt.substr(0,4);
	let m = dtt.substr(4,2);
	let d = dtt.substr(6,2);
	let hh = dtt.substr(8,2);
	let mm = dtt.substr(10,2);
	let dd = dtt.substr(12,2);

	var myutc = y + "-" + m + "-" + d + "T" + hh + ":" + mm + ":" + dd + "+00:00";

	return myutc;
}

function UTCToUnix(utc){

	return new Date(utc).getTime()/1000;
}

function UnixToUTC(unix){
	
	return new Date(unix*1000);
}

async function loadGameDayFromLiveScoreAPI(date){
    
    let url = "https://livescore-basketball.p.rapidapi.com/basketball/matches-by-date";
    url += "?date=" + date.replace(/-/g,"") + "&timezone_utc=0:00";
    
    const opts = rapidapiHeadersLiveScore;
    const res = await fetch(url, opts);
    const json = await res.json();
 
    var teamIndex = [];
    var matchIndex = [];

    let promises1 = json.data.map(async league => {
        let promises2 = league.matches.map(async match => {
        	let ts = UTCToUnix(fubarDateToUTC(match.time.scheduled.toString()));

            teamIndex.push({ 
            	src: "lsapi", 
            	ts, 
            	matchid: Number(match.match_id), 
            	team1id: Number(match.team_1.id), 
            	team1name: match.team_1.name, 
            	team2id: Number(match.team_2.id), 
            	team2name: match.team_2.name 
            });
        });
        await Promise.all(promises2);
    });

    await Promise.all(promises1);

    return teamIndex;
}

async function loadGameDayFromBasketAPI(date){
    
    let url = "https://api-basketball.p.rapidapi.com/games?date=" + date;

    const opts = rapidapiHeaders;
    const res = await fetch(url, opts);
    const json = await res.json();

    var teamIndex = [];

    let promises1 = json.response.map(async match => {
    	let ts = UTCToUnix(match.date);

        teamIndex.push({ 
        	src: "bbapi", 
        	ts, 
        	matchid: Number(match.id), 
        	team1id: Number(match.teams.home.id), 
        	team1name: match.teams.home.name, 
        	team2id: Number(match.teams.away.id), 
        	team2name: match.teams.away.name 
        });

    });

    await Promise.all(promises1);

    return teamIndex;
}

async function preProcessFromDisk(loadToday, loadForward, loadBackward){

	let allbbapi = [];
	let alllsapi = [];

	if (loadToday == 1){

		let dt = moment().format("YYYY-MM-DD");
		let bbd = JSON.parse(fs.readFileSync("./json.idsupervisor-db/livescores" + dt + ".json"));
		let lsd = JSON.parse(fs.readFileSync("./json.idsupervisor-db/basketapi" + dt + ".json"));
		
		allbbapi = allbbapi.concat(bbd);
		alllsapi = alllsapi.concat(lsd);
	}

	for(let i=1;i<loadForward+1;i++){

		let dt = moment().add(i,"days").format("YYYY-MM-DD");
		let bbd = JSON.parse(fs.readFileSync("./json.idsupervisor-db/livescores" + dt + ".json"));
		let lsd = JSON.parse(fs.readFileSync("./json.idsupervisor-db/basketapi" + dt + ".json"));
		
		allbbapi = allbbapi.concat(bbd);
		alllsapi = alllsapi.concat(lsd);

	}	

	for(let i=1;i<loadBackward+1;i++){
		
		let dt = moment().subtract(i,"days").format("YYYY-MM-DD");
		
		let bbd = JSON.parse(fs.readFileSync("./json.idsupervisor-db/livescores" + dt + ".json"));
		let lsd = JSON.parse(fs.readFileSync("./json.idsupervisor-db/basketapi" + dt + ".json"));
		
		allbbapi = allbbapi.concat(bbd);
		alllsapi = alllsapi.concat(lsd);

	}	

	console.log(allbbapi.length + " total basketapi done");
	console.log(alllsapi.length + " total livescores done");

	fs.writeFileSync("./json.idsupervisor-db/basketapi_all.json", JSON.stringify(allbbapi, undefined, 4));
	fs.writeFileSync("./json.idsupervisor-db/livescores_all.json", JSON.stringify(alllsapi, undefined, 4));

	process(allbbapi, alllsapi);
}

async function preProcessFromLiveAPI(loadToday, loadForward, loadBackward){

	let allbbapi = [];
	let alllsapi = [];

	if (loadToday == 1){

		let dt = moment().format("YYYY-MM-DD");
		
		let lsd = await loadGameDayFromLiveScoreAPI(dt);
		fs.writeFileSync("./json.idsupervisor-db/livescores" + dt + ".json", JSON.stringify(lsd, undefined, 4));

		let bbd = await loadGameDayFromBasketAPI(dt);
		fs.writeFileSync("./json.idsupervisor-db/basketapi" + dt + ".json", JSON.stringify(bbd,undefined,4));
		
		allbbapi = allbbapi.concat(bbd);
		alllsapi = alllsapi.concat(lsd);

		console.log(dt, lsd.length, "livescores done");
		console.log(dt, bbd.length, "basketapi done, waiting...");

		await wait(1500);
		console.log("Continue");
	}

	for(let i=1;i<loadForward+1;i++){

		let dt = moment().add(i,"days").format("YYYY-MM-DD");
		
		let lsd = await loadGameDayFromLiveScoreAPI(dt);
		fs.writeFileSync("./json.idsupervisor-db/livescores" + dt + ".json", JSON.stringify(lsd, undefined, 4));

		let bbd = await loadGameDayFromBasketAPI(dt);
		fs.writeFileSync("./json.idsupervisor-db/basketapi" + dt + ".json", JSON.stringify(bbd,undefined,4));
		
		allbbapi = allbbapi.concat(bbd);
		alllsapi = alllsapi.concat(lsd);

		console.log(dt, lsd.length, "livescores done");
		console.log(dt, bbd.length, "basketapi done, waiting...");

		await wait(1500);
		console.log("Continue");

	}	

	for(let i=1;i<loadBackward+1;i++){
		
		let dt = moment().subtract(i,"days").format("YYYY-MM-DD");
		
		let lsd = await loadGameDayFromLiveScoreAPI(dt);
		fs.writeFileSync("./json.idsupervisor-db/livescores" + dt + ".json", JSON.stringify(lsd, undefined, 4));

		let bbd = await loadGameDayFromBasketAPI(dt);
		fs.writeFileSync("./json.idsupervisor-db/basketapi" + dt + ".json", JSON.stringify(bbd,undefined,4));
		
		allbbapi = allbbapi.concat(bbd);
		alllsapi = alllsapi.concat(lsd);

		console.log(dt, lsd.length, " livescores done");
		console.log(dt, bbd.length, " basketapi done, waiting...");

		await wait(1500);
		console.log("Continue");

	}	

	console.log(allbbapi.length + " total basketapi done");
	console.log(alllsapi.length + " total livescores done");

	fs.writeFileSync("./json.idsupervisor-db/basketapi_all.json", JSON.stringify(allbbapi, undefined, 4));
	fs.writeFileSync("./json.idsupervisor-db/livescores_all.json", JSON.stringify(alllsapi, undefined, 4));

	process(allbbapi, alllsapi);
}

function process(a1, a2){

	let api1 = a1 ? a1 : JSON.parse(fs.readFileSync("./json.idsupervisor-db/basketapi_all.json")); 
	let api2 = a2 ? a2 : JSON.parse(fs.readFileSync("./json.idsupervisor-db/livescores_all.json")); 

	let master = api1;
	let matcher1 = api2;

	let matchMaster = [];
	masterMatchRoll = 0;
	masterTeam1Roll = 0;
	masterTeam2Roll = 0;

	master.map(a1=>{

		let matchingGame = matcher1.find(a2=>{
			return a1.team1name == a2.team1name &&
			a1.team2name == a2.team2name &&
			a1.ts == a2.ts
		});

		if (matchingGame){
			matchMaster.push({
				masterMatchId: masterMatchRoll++,
				masterTeam1Id: masterTeam1Roll++,
				masterTeam2Id: masterTeam2Roll++,
				api1MatchId: a1.matchid,
				api1Team1Id: a1.team1id,
				api1Team2Id: a1.team2id,
				api2MatchId: matchingGame.matchid,
				api2Team1Id: matchingGame.team1id,
				api2Team2Id: matchingGame.team2id,
				team1Name: a1.team1name,
				team2Name: a1.team2name,
				timestamp: a1.ts
			});
		}

	});

	let matchObjectMaster = matchMaster.reduce((m,o)=>{
		m[o.masterMatchId] = o;
		return m;
	}, {});

	let teamMasterNameIndex = matchMaster.reduce((m,o)=>{
		m[o.team1Name] = { "m": o.masterTeam1Id, "a1":o.api1Team1Id, "a2": o.api2Team1Id };
		m[o.team2Name] = { "m": o.masterTeam2Id, "a1":o.api1Team2Id, "a2": o.api2Team2Id };
		return m;
	}, {});

	let teamMasterId = matchMaster.reduce((m,o)=>{
		m[o.masterTeam1Id] = { "m": o.masterTeam1Id, "a1":o.api1Team1Id, "a2": o.api2Team1Id };
		m[o.masterTeam1Id] = { "m": o.masterTeam2Id, "a1":o.api1Team2Id, "a2": o.api2Team2Id };
		return m;
	}, {});

	let teamA1 = matchMaster.reduce((m,o)=>{
		m[o.api1Team1Id] = { "m": o.masterTeam1Id, "a1":o.api1Team1Id, "a2": o.api2Team1Id };
		m[o.api1Team1Id] = { "m": o.masterTeam2Id, "a1":o.api1Team2Id, "a2": o.api2Team2Id };
		return m;
	}, {});

	let teamA2 = matchMaster.reduce((m,o)=>{
		m[o.api1Team2Id] = { "m": o.masterTeam1Id, "a1":o.api1Team1Id, "a2": o.api2Team1Id };
		m[o.api1Team2Id] = { "m": o.masterTeam2Id, "a1":o.api1Team2Id, "a2": o.api2Team2Id };
		return m;
	}, {});

	fs.writeFileSync("./json.idsupervisor-db/MASTER_MATCH_OBJECT.json", JSON.stringify(matchObjectMaster, undefined, 4));
	fs.writeFileSync("./json.idsupervisor-db/MASTER_MATCH.json", JSON.stringify(matchMaster, undefined, 4));
	fs.writeFileSync("./json.idsupervisor-db/MASTER_TEAM_NAME.json", JSON.stringify(teamMasterNameIndex, undefined, 4));
	fs.writeFileSync("./json.idsupervisor-db/MASTER_MASTER_TEAM_ID.json", JSON.stringify(teamMasterId, undefined, 4));
	fs.writeFileSync("./json.idsupervisor-db/MASTER_API1_TEAM_ID.json", JSON.stringify(teamA1, undefined, 4));
	fs.writeFileSync("./json.idsupervisor-db/MASTER_API2_TEAM_ID.json", JSON.stringify(teamA2, undefined, 4));
}

preProcessFromDisk(1,5,0);

