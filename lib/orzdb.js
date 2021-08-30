var fs = require("fs");

class orzdb {

    constructor(dbPath){
    	this.dbPath = dbPath;
    	this.db = JSON.parse(fs.readFileSync(dbPath, {encoding:'utf8', flag:'r'})); 
    }

	orzdbSet = (key, val, save) => {
	    this.db[key] = val;
	    if (save) fs.writeFileSync(this.dbPath, JSON.stringify(this.db));
	}

	orzdbGet = (key) => {
	    return this.db[key];
	}

}

module.exports = orzdb;