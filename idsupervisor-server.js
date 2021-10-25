const express = require("express");
const app = express();
const fs = require("fs");
const apiRoutes = express.Router(); 
const port = 1235;
var indices = {};

function loadDb(){
    match_index = JSON.parse(fs.readFileSync("./json.idsupervisor-db/MASTER_MATCH.json"));
    mid_index = JSON.parse(fs.readFileSync("./json.idsupervisor-db/MASTER_MASTER_TEAM_ID.json"));
    api1_index = JSON.parse(fs.readFileSync("./json.idsupervisor-db/MASTER_API1_TEAM_ID.json"));
    api2_index = JSON.parse(fs.readFileSync("./json.idsupervisor-db/MASTER_API2_TEAM_ID.json"));
    return {mid_index, api1_index, api2_index};
}

app.use(express.json())

api = () => {
    
    try{

        apiRoutes.post('/:getapiids', async (req, res) => {
            let match = match_index[req.body.masterid];
            res.json(match);
        });

        app.use('/ids', apiRoutes);
        app.listen(port);

    } catch(e) {
        console.log(e);
    }

}

indices = loadDb();

api();
