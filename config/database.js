var MongoClient = require('mongodb').MongoClient

function getConnectionString(connection_string) {


  if (process.env.OPENSHIFT_MONGODB_DB_PASSWORD) {
    connection_string = 'mongodb://' + process.env.OPENSHIFT_MONGODB_DB_USERNAME + ":" +
      process.env.OPENSHIFT_MONGODB_DB_PASSWORD + "@" +
      process.env.OPENSHIFT_MONGODB_DB_HOST + ':' +
      process.env.OPENSHIFT_MONGODB_DB_PORT + '/' +
      process.env.OPENSHIFT_APP_NAME;
  }
  return connection_string;
}
var connection;

var connect = function(connectionString, done) {
  if (connection) return done();
  var url = getConnectionString(connectionString);
  console.log(url);
  MongoClient.connect(url, function(err, db) {
    if (err){
      return done(err);
    }
    connection = db;
    connection.collection("friends").createIndex({"created": 1},{expireAfterSeconds:30*60 } );
    connection.collection("friends").createIndex({loc:"2dsphere"});

    done();
  })
}
var get = function() {
  return connection;
}
var close = function(done) {
  if (connection) {
    connection.close(function(err, result) {
      connection= null;
      done(err,result)
    })
  }
}
module.exports.connect = connect;
module.exports.get = get;
module.exports.close = close;

router.post("/register/:distance", function (req, res) {
    var db = connection.get();
    var user = req.body;
    var distance = req.params.distance*1000;//in km
    delete user.distance;
    user.created = new Date(); //This is the property with the TTL index
    db.collection("friends").findOneAndReplace(
        {userName: user.userName}, user, function (err, result) {
            if (err) {
                res.statusCode = 500;
                return res.json({code: 500, msg: err.message});
            }
            if (result.value == null) { //User was not found
                db.collection("friends").insertOne(user, function (err, result) {
                    if (err) {
                        res.statusCode = 500;
                        return res.json({code: 500, msg: err.message});
                    }
                    return findNearestAndMakeResponse(user, distance, res)
                });
            }
            else {
                return findNearestAndMakeResponse(user, distance, res);
            }
        });
});
function findNearestAndMakeResponse(user, distance, res) {
    var db = connection.get();
    db.collection("friends").find({
        userName: {$ne: user.userName},
        loc: {$near: user.loc,$maxDistance: distance}
    },{_id: 0, created: 0}).toArray(function (err, docs) {
        if (err) {
            res.statusCode = 500;
            return res.json({code: 500, msg: err.message});
        }
        return res.json(docs);
    });
};