const express = require("express")
const app = express();
const ea = new (require("./lib/easyadapter.js"))();
const apiRoutes = express.Router(); 
const port = 1234;
const log = (m) => console.log("Exiguous> " + m);

app.use(express.json())

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
        console.log(e);
       log("api:error"); 
    }

}

api();
