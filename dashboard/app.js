const express = require("express");
const path = require("path"); //for path navigation
const bodyParser = require("body-parser"); //to access at req.value
const methodOverride = require("method-override"); //needs for edit and delete
const { PubSub } = require("@google-cloud/pubsub"); //google cloud pub/sub module
const mongoose = require("mongoose"); //database
const exphbs = require("express-handlebars"); //front-end

const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);

//load values model
require("./models/Value");
const Values = mongoose.model("values");
require("./models/Accel_cloud");
const AccelCloud = mongoose.model("accel_cloud");
require("./models/Accel_edge");
const AccelEdge = mongoose.model("accel_edge");

//handlebars helpers
const { stripTags } = require("./helpers/hbs");
const { eq } = require("./helpers/hbs");

/********************************************************************************************************/
/*                                    WebSocket and MQTT connection                                     */
/********************************************************************************************************/

function predict(x, y, z) {
  let magnitude = Math.hypot(x, y, z);
  if (magnitude > 9.05 && magnitude < 9.95) return 1;
  else return 0;
}

// Imports the Google Cloud client library
io.on("connection", function (socket) {
  var values = Values.find({
    date: { $gt: parseInt(Date.now() / 1000) - 3600 },
  })
    .sort({ date: -1 })
    .then((values) => {
      io.emit("lastvalues", values);
    });

  const subscriptionName1 =
    "projects/awesome-sylph-271611/subscriptions/my-subscription";

  // Creates a client; cache this for further use
  const pubSubClient = new PubSub();

  function listenForMessages() {
    // References an existing subscription
    const subscription = pubSubClient.subscription(subscriptionName1);
    // Create an event handler to handle messages
    const messageHandler = (message) => {
      console.log(`Received message ${message.id}:`);
      console.log("\tData:" + message.data);
      console.log(`\tAttributes: ${message.attributes}`);
      let payload = "${message.data)}".split(";");

      const newValue = {
        deviceId: payload.deviceId,
        temperature: payload.temperature,
        humidity: payload.humidity,
        pressure: payload.pressure,
        date: payload.date,
      };
      new Values(newValue).save();

      // TEMPERATURE
      io.emit(
        "temperature",
        (
          payload.deviceId +
          ";" +
          payload.temperature +
          ";" +
          payload.date
        ).toString()
      );
      // HUMIDITY
      io.emit(
        "humidity",
        (
          payload.deviceId +
          ";" +
          payload.humidity +
          ";" +
          payload.date
        ).toString()
      );
      // pressure
      io.emit(
        "pressure",
        (
          payload.deviceId +
          ";" +
          payload.pressure +
          ";" +
          payload.date
        ).toString()
      );
      // "Ack" (acknowledge receipt of) the message
      message.ack();
    };

    // Listen for new messages until timeout is hit
    subscription.on("message", messageHandler);
  }
  listenForMessages();
});
/***********************************************************************************************************************/

//handlebars middleware
app.engine(
  "handlebars",
  exphbs({
    helpers: { stripTags: stripTags, eq: eq },
    defaultLayout: "main",
  })
);
app.set("view engine", "handlebars");

//body parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, ".")));

//method override middleware
app.use(methodOverride("_method"));

// Map global promise - get rid of warning
mongoose.Promise = global.Promise;
//connect to mongoose
const uri =
  "mongodb+srv://assignment1:5JuACpmKysNwVGae@cluster0-1fa34.gcp.mongodb.net/IoT-assignment1";
mongoose
  .connect(uri, {
    useNewUrlParser: true,
  })
  .then(() => {
    console.log("MongoDb Connected...");
  })
  .catch((err) => console.log(err));

// GET Home page
app.get("/", function (req, res) {
  Values.find({ date: { $gt: parseInt(Date.now() / 1000) - 3600 } }).then(
    (values) => {
      res.render("index", { values: values });
    }
  );
});

// Starting Server
const port = process.env.PORT || 5000;
http.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
