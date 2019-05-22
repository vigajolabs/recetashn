'use strict';

const dialogflow = require('dialogflow');
const config = require('./config');
const express = require('express');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const request = require('request');
const app = express();
const uuid = require('uuid');
const pg = require('pg');
const broadcast = require('./routes/broadcast');
const webviews = require('./routes/webviews');
//const userService = require('./services/user-service');
const userService = require('./user');
const colors = require('./colors');
let dialogflowService = require('./services/dialogflow-service');
const fbService = require('./services/fb-service');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const session = require('express-session');

//---------
const imagesopas="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS68eVtaZ3c6xmmFs72JTgbr8F6ozrGg25xu8PwdrumxozrxfNU";
const imagesrapidas="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSEYwEJXv2mP-jHnt-3rFfWUTTXjeSzdVXb8nAdyk1NjVggxF_lBw";
const imagespollo="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTFHO8yhXCy9Z5SWlfLB9PLYKjbKcAyZOajZjiyVCn2jp79cxxTpQ";
const imagespasta="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSG-BgcWo-iHOYKN5iq8EeOfAkJYiFeyOhz2TYzY7QuM3RprkjH";

// Messenger API parameters
if (!config.FB_PAGE_TOKEN) {
    throw new Error('missing FB_PAGE_TOKEN');
}
if (!config.FB_VERIFY_TOKEN) {
    throw new Error('missing FB_VERIFY_TOKEN');
}
if (!config.GOOGLE_PROJECT_ID) {
    throw new Error('missing GOOGLE_PROJECT_ID');
}
if (!config.DF_LANGUAGE_CODE) {
    throw new Error('missing DF_LANGUAGE_CODE');
}
if (!config.GOOGLE_CLIENT_EMAIL) {
    throw new Error('missing GOOGLE_CLIENT_EMAIL');
}
if (!config.GOOGLE_PRIVATE_KEY) {
    throw new Error('missing GOOGLE_PRIVATE_KEY');
}
if (!config.FB_APP_SECRET) {
    throw new Error('missing FB_APP_SECRET');
}
if (!config.SERVER_URL) { //used for ink to static files
    throw new Error('missing SERVER_URL');
}

if (!config.PG_CONFIG) { //pg config
    throw new Error('missing PG_CONFIG');
}
if (!config.ADMIN_ID) { //admin id for login
    throw new Error('missing ADMIN_ID');
}

app.set('port', (process.env.PORT || 5000))

pg.defaults.ssl = true;

//verify request came from facebook
app.use(bodyParser.json({
    verify: fbService.verifyRequestSignature
}));

//serve static files in the public directory
app.use(express.static('public'));

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({
    extended: false
}));

// Process application/json
app.use(bodyParser.json());


app.use(session(
    {
        secret: 'keyboard cat',
        resave: true,
        saveUninitilized: true
    }
));


app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(profile, cb) {
    cb(null, profile);
});

passport.deserializeUser(function(profile, cb) {
    cb(null, profile);
});

passport.use(new FacebookStrategy({
        clientID: config.FB_APP_ID,
        clientSecret: config.FB_APP_SECRET,
        callbackURL: config.SERVER_URL + "auth/facebook/callback"
    },
    function(accessToken, refreshToken, profile, cb) {
        process.nextTick(function() {
            return cb(null, profile);
        });
    }
));

app.get('/auth/facebook', passport.authenticate('facebook',{scope:'public_profile'}));


app.get('/auth/facebook/callback',
    passport.authenticate('facebook', { successRedirect : '/broadcast/broadcast', failureRedirect: '/broadcast' }));



app.set('view engine', 'ejs');



const credentials = {
    client_email: config.GOOGLE_CLIENT_EMAIL,
    private_key: config.GOOGLE_PRIVATE_KEY,
};

const sessionClient = new dialogflow.SessionsClient(
    {
        projectId: config.GOOGLE_PROJECT_ID,
        credentials
    }
);


const sessionIds = new Map();
const usersMap = new Map();

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

app.use('/broadcast', broadcast);
app.use('/webviews', webviews);



// for Facebook verification
app.get('/webhook/', function (req, res) {
    console.log("request");
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.FB_VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
})

/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook/', function (req, res) {
    var data = req.body;
    console.log(JSON.stringify(data));

    // Make sure this is a page subscription
    if (data.object == 'page') {
        // Iterate over each entry
        // There may be multiple if batched
        data.entry.forEach(function (pageEntry) {
            var pageID = pageEntry.id;
            var timeOfEvent = pageEntry.time;

            // Iterate over each messaging event
            pageEntry.messaging.forEach(function (messagingEvent) {
                if (messagingEvent.optin) {
                    fbService.receivedAuthentication(messagingEvent);
                } else if (messagingEvent.message) {
                    receivedMessage(messagingEvent);
                } else if (messagingEvent.delivery) {
                    fbService.receivedDeliveryConfirmation(messagingEvent);
                } else if (messagingEvent.postback) {
                    receivedPostback(messagingEvent);
                } else if (messagingEvent.read) {
                    fbService.receivedMessageRead(messagingEvent);
                } else if (messagingEvent.account_linking) {
                    fbService.receivedAccountLink(messagingEvent);
                } else {
                    console.log("Webhook received unknown messagingEvent: ", messagingEvent);
                }
            });
        });

        // Assume all went well.
        // You must send back a 200, within 20 seconds
        res.sendStatus(200);
    }
});


function setSessionAndUser(senderID) {
    if (!sessionIds.has(senderID)) {
        sessionIds.set(senderID, uuid.v1());
    }

    if (!usersMap.has(senderID)) {
        userService.addUser(function(user){
            usersMap.set(senderID, user);
        }, senderID);
    }
}


function receivedMessage(event) {

    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    setSessionAndUser(senderID);

    //console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
    //console.log(JSON.stringify(message));

    var isEcho = message.is_echo;
    var messageId = message.mid;
    var appId = message.app_id;
    var metadata = message.metadata;

    // You may get a text or attachment but not both
    var messageText = message.text;
    var messageAttachments = message.attachments;
    var quickReply = message.quick_reply;

    if (isEcho) {
        fbService.handleEcho(messageId, appId, metadata);
        return;
    } else if (quickReply) {
        handleQuickReply(senderID, quickReply, messageId);
        return;
    }


    if (messageText) {
        //send message to DialogFlow
        dialogflowService.sendTextQueryToDialogFlow(sessionIds, handleDialogFlowResponse, senderID, messageText);
    } else if (messageAttachments) {
        fbService.handleMessageAttachments(messageAttachments, senderID);
    }
}


function handleQuickReply(senderID, quickReply, messageId) {
    var quickReplyPayload = quickReply.payload;
    switch (quickReplyPayload) {
       
        default:
            dialogflowService.sendTextQueryToDialogFlow(sessionIds, handleDialogFlowResponse, senderID, quickReplyPayload);
            break;
    }
}


function handleDialogFlowAction(sender, action, messages, contexts, parameters) {
    switch (action) {

      //inicio
	  
	 case "prueba21":
	 console.log("prueba");
	 break;	
	  
	 case "prueba2":
	 console.log("prueba");
	  console.log(parameters.fields);
        //------
        if (parameters.fields['COMIDA'].stringValue==null){
          sendTextMessage(sender,"Recueda que para hacer una busqueda debes escribir BUSCAR antes de la busqueda, Ej.\n1-buscar accidente carretera CA-5 \n2-Buscar partido olimpia-motagua");
       
        //------
        //if ( parameters.fields.hasOwnProperty('geo-city') && parameters.fields['geo-city'].stringValue!='') {
	   } else if ( parameters.fields.hasOwnProperty('COMIDA') && parameters.fields['COMIDA'].stringValue!='') {
		  request({
		 //url: 'http://api.openweathermap.org/data/2.5/weather', //URL to hit
			url: 'https://test-es.edamam.com/search?q&app_id=c8004eba&app_key=ea1f3c160aa46a042e7fb25b2a546a5a&from=0&to=3',
			  qs: {
				//appid: config.WEATHER_API_KEY,
		//q: parameters.fields['geo-city'].stringValue
		q: parameters.fields['COMIDA'].stringValue
			  }, //Query string data
		  }, function(error, response, body){
		 if( response.statusCode === 200) {
		   let respuesta=JSON.parse(body);
		   //console.log(respuesta);
			  if (respuesta.hasOwnProperty("hits")){
				    //const imagen0=respuesta["hits"][0]["recipe"]["image"];
			//for (let i=0,l=hits.recipe.image;i<1;i++){		
			//const imagen0=respuesta.hits;
			 const imagen1=respuesta.hits[0].recipe[0].uri;	
			  //const imagen2=respuesta.hits.recipe[1].uri;	
			 // console.log(imagen0);
			   console.log(imagen1);
			
			  //  }
			  }
			 } else {
			console.log('error busqueda');
			}
		  });
		 } else {
		fbServicesendTextMessage(sender, 'NO tenemos ese modelo.');
		}
	break;

      case "preguntas.recibirrecetas":
      console.log(parameters.fields);
      if (parameters.fields['RespuestaNoti'].stringValue=="SiNoti"){
         //------------  
        userService.newsletterSettings(function(updated) {
         if (updated) {
          } 
           }, 1, sender);
        //-------------
        setTimeout(function(){
           let buttons = [
                     {
                        type:"postback",
                        title:"Rápidas 🏍️",
                        payload:"CatRapidas"
                     },  
                     {
                        type:"postback",
                        title:"Pollo 🍗",
                        payload:"CatPollo"
                     },
                     {
                         type:"postback",
                        title:"Sopas 🍲 ",
                        payload:"CatSopas"
                     },
                   ];
                 fbService.sendButtonMessage(sender, "Que tipo de recetas te gustaría te envíemos? Puedes seleccionar varias", buttons);
                },300) 
               setTimeout(function() {
              let buttons = [
              {
               type:"postback",
               title:"Pasta 🍝",
               payload:"CatPasta"
              },  
              // {
              //  type:"postback",
              //  title:"FARMACIAS ⚕️💊 ",
              //  payload:"CatFARM"
              // },
                    // {
                    //      type:"postback",
                    //     title:"PERFUMES Y LOCIONES",
                    //     payload:"CatPerfume"
                    // },
              ];
            fbService.sendButtonMessage(sender, "✨", buttons);
           },600) 
      //---------------------
          setTimeout(function(){
            let replies = [
              {
              "content_type":"text",
              "title":"MENU INICIO",
              "payload":"INICIO"
              },  
             ];  
            fbService.sendQuickReply(sender,"Regresa a menu de recetas ",replies);  
          },1500)
      } else if (parameters.fields['RespuestaNoti'].stringValue=="NoNoti"){  
     //---------------------   
          userService.newsletterSettings(function(updated) {
           if (updated) {
            } 
             }, 0, sender);
     //---------------------
          setTimeout(function(){
             let elements =[  
                {
                "title":"Pollo 🍗",
                "image_url":imagespollo,
                "subtitle":"RECETAS con POLLO",
        
                  "buttons":[
                      {
                       "type":"postback",
                        "title":"INGREDIENTES",
                        "payload":"RecetasPollo"
                       },               
                      ]         
                },
                {
                "title":"Pasta 🍝",
                "image_url":imagespasta,
                "subtitle":"Recetas de Pastas",

                   "buttons":[
                       {
                        "type":"postback",
                        "title":"INGREDIENTES",
                        "payload":"RecetasPasta"
                        },            
                      ]           
                    },
                    {
                   "title":"Sopas 🍲",
                    "image_url":imagesopas,
                    "subtitle":"Delicioso Recetas de Sopas",

                      "buttons":[
                          {
                             "type":"postback",
                            "title":"INGREDIENTES",
                            "payload":"RecetasSopa"
                           },
                          // {
                          //   "type":"web_url",
                          //   "url":"https://www.detektor.com.hn/video/Detektor-smart.mp4",
                          //   "title":"Como Funciona",
                          //   "webview_height_ratio": "tall"
                          //  },
                     ]        
                    },
                     {
                   "title":"Rápidas ⏱",
                    "image_url":imagesrapidas,
                    "subtitle":"Recetas Rápidas y de bajo precio",

                      "buttons":[
                          {
                             "type":"postback",
                            "title":"INGREDIENTES",
                            "payload":"RecetasRapidas"
                           },       
                       ]           
                    },
                   
                    ];
                    fbService.sendGenericMessage(sender, elements); 
                },500)
                 setTimeout(function(){
                let replies = [
                 {
                  "content_type":"text",
                  "title":"MENU INICIO",
                  "payload":"INICIO"
                 },  
               ];  
         fbService.sendQuickReply(sender,"Regresa a menú de recetas ",replies);  
          },1500)
         }
      break;


      
        default:
            //unhandled action, just send back the text
            fbService.handleMessages(messages, sender);
    }
}

//---------------
function callSendAPI (messageData) {
        request({
            uri: 'https://graph.facebook.com/v2.6/me/messages',
            qs: {
                access_token: config.FB_PAGE_TOKEN
            },
            method: 'POST',
            json: messageData

        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var recipientId = body.recipient_id;
                var messageId = body.message_id;

                if (messageId) {
                    console.log("Successfully sent message with id %s to recipient %s",
                        messageId, recipientId);
                } else {
                    console.log("Successfully called Send API for recipient %s",
                        recipientId);
                }
            } else {
                console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
            }
        });
    }

    function sendAudioMessage(recipientId,Audioname) {
   // function sendAudioMessage(recipientId) {
        //let self = module.exports;
        var messageData = {
            recipient: {
                id: recipientId
            },
            message: {
                attachment: {
                    type: "audio",
                    payload: {
                        url: config.SERVER_URL + Audioname
                        //url: config.SERVER_URL + "/assets/Doctor.mp3"
                    }
                }
            }
        };
        callSendAPI(messageData);
       // self.callSendAPI(messageData);
    }

    function sendGifMessage(recipientId){
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: "image",
                payload: {
                    url: config.SERVER_URL + "/assets/hello-1.gif"  //Gifname
                }
            }
        }
    };
    callSendAPI(messageData);
    }



    function sendTextMessage(recipientId, text) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text
        }
    }
    callSendAPI(messageData);
}
//--------------

function handleMessages(messages, sender) {
    let timeoutInterval = 1100;
    let previousType ;
    let cardTypes = [];
    let timeout = 0;
    for (var i = 0; i < messages.length; i++) {

        if ( previousType == "card" && (messages[i].message != "card" || i == messages.length - 1)) {
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        } else if ( messages[i].message == "card" && i == messages.length - 1) {
            cardTypes.push(messages[i]);
            timeout = (i - 1) * timeoutInterval;
            setTimeout(handleCardMessages.bind(null, cardTypes, sender), timeout);
            cardTypes = [];
        } else if ( messages[i].message == "card") {
            cardTypes.push(messages[i]);
        } else  {

            timeout = i * timeoutInterval;
            setTimeout(handleMessage.bind(null, messages[i], sender), timeout);
        }

        previousType = messages[i].message;

    }
}

function handleDialogFlowResponse(sender, response) {
    let responseText = response.fulfillmentMessages.fulfillmentText;

    let messages = response.fulfillmentMessages;
    let action = response.action;
    let contexts = response.outputContexts;
    let parameters = response.parameters;

    fbService.sendTypingOff(sender);

    if (fbService.isDefined(action)) {
        handleDialogFlowAction(sender, action, messages, contexts, parameters);
    } else if (fbService.isDefined(messages)) {
        fbService.handleMessages(messages, sender);
    } else if (responseText == '' && !fbService.isDefined(action)) {
        //dialogflow could not evaluate input.
        fbService.sendTextMessage(sender, "I'm not sure what you want. Can you be more specific?");
    } else if (fbService.isDefined(responseText)) {
        fbService.sendTextMessage(sender, responseText);
    }
}


async function resolveAfterXSeconds(x) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(x);
        }, x * 1000);
    });
}

async function greetUserText(userId) {
    let user = usersMap.get(userId);
    if (!user) {
        await resolveAfterXSeconds(2);
        user = usersMap.get(userId);
    }
    fbService.sendTextMessage(userId, "Hola " + user.first_name + '! ');
}





/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    setSessionAndUser(senderID);

    // The 'payload' param is a developer-defined field which is set in a postback 
    // button for Structured Messages. 
    var payload = event.postback.payload;

    switch (payload) {

        case 'GET_STARTED':
        //fbService.sendGifMessage(senderID,"/assets/hello-1.gif");
        setTimeout(function(){
        greetUserText(senderID);
        },1800) 
        fbService.sendTypingOn(senderID);
        setTimeout(function(){
            let buttons = [
          // {
          //   type:"postback",
          //   title:"INICIAR sin ENVIO",
          //   payload:"INICIAR_CIBO"
          // },
           {
            type:"postback",
            title:"INICIAR",
            payload:"INICIAR_CIBO"
          },
        ];
        fbService.sendButtonMessage(senderID, "Hola, mi nombre es CIBO, soy tu asistente virtual y estoy para ayudarte con algunas recetas!! 🍽 😀", buttons);    
        },3000)
        break;

        case 'INICIAR_CIBO':
        colors.Readall(function(elementos){
         console.log(elementos);
          const todos=elementos.map(function(resultados){  
           const fbid=resultados.fb_id;
            const noti=resultados.newsletter;
             const nombre=resultados.first_name;
              if (noti===null){
              setTimeout(function(){
             let replies = [
              {
              "content_type":"text",
              "title":"SI",
              "payload":"SiNoti"
              },
              {
              "content_type":"text",
              "title":"NO",
              "payload":"NoNoti"
              },
            ];    
            fbService.sendQuickReply(senderID,"Te gustaría que te envíara recetas? ",replies);  //responseText
             },1500)
            } else {
              setTimeout(function(){
              let elements =[  
                {
                "title":"Pollo 🍗",
                "image_url":imagespollo,
                "subtitle":"Recetas con Pollo",
        
                  "buttons":[
                      {
                       "type":"postback",
                        "title":"VER RECETAS",
                        "payload":"RecetasPollo"
                       },               
                      ]         
                },
                {
                "title":"Pasta 🍝",
                "image_url":imagespasta,
                "subtitle":"Recetas de Pastas",

                   "buttons":[
                       {
                        "type":"postback",
                        "title":"VER RECETAS",
                        "payload":"RecetasPasta"
                        },            
                      ]           
                    },
                    {
                   "title":"Sopas 🍲",
                    "image_url":imagesopas,
                    "subtitle":"Delicioso Recetas de Sopas",

                      "buttons":[
                          {
                             "type":"postback",
                            "title":"VER RECETAS",
                            "payload":"RecetasSopa"
                           },
                          // {
                          //   "type":"web_url",
                          //   "url":"https://www.detektor.com.hn/video/Detektor-smart.mp4",
                          //   "title":"Como Funciona",
                          //   "webview_height_ratio": "tall"
                          //  },
                     ]        
                    },
                     {
                   "title":"Rápidas ⏱",
                    "image_url":imagesrapidas,
                    "subtitle":"Recetas Rápidas y de bajo precio",

                      "buttons":[
                          {
                             "type":"postback",
                            "title":"VER RECETAS",
                            "payload":"RecetasRapidas"
                           },       
                       ]           
                    },
                   
                    ];
                    fbService.sendGenericMessage(senderID, elements); 
                },500)
                 setTimeout(function(){
                let replies = [
                 {
                  "content_type":"text",
                  "title":"MENU INICIO",
                  "payload":"INICIAR_CIBO"
                 },  
               ];  
              fbService.sendQuickReply(senderID,"Regresa a menu de recetas ",replies);  
             },1500)
           }
          }) 
         },senderID)
        break;

        case 'RecetasRapidas':
         colors.RecetasRapidas(function(elementos){
        });    
        break;

        case 'RecetasSopa':
        //fbService.sendTextMessage(senderID,"Sopa");
         colors.RecetasSopas(function(elementos){
        });   
        break;

        case 'RecetasPasta':
         colors.RecetasPasta(function(elementos){
        });   
        break;

        case 'RecetasPollo':
         colors.RecetasPollo(function(elementos){
          console.log(elementos);
           setTimeout(function(){
            let elements =[  
             {
              "title":elementos[0].nombre,
              "image_url":elementos[0].urlimagen,
              "subtitle":elementos[0].descrip,
        
              "buttons":[
               {
                "type":"postback",
                "title":"INGREDIENTES",
                "payload":"receta0"
               },   
                    
                ]         
              },
              {
                "title":elementos[1].nombre,
                "image_url":elementos[1].urlimagen,
                "subtitle":elementos[1].descrip,

                "buttons":[
                 {
                   "type":"postback",
                  "title":"INGREDIENTES",
                  "payload":"receta1"
               }, 
              ]        
              },
              {
                 "title":elementos[2].nombre,
                 "image_url":elementos[2].urlimagen,
                 "subtitle":elementos[2].descrip,

                "buttons":[
                {
                   "type":"postback",
                  "title":"INGREDIENTES",
                  "payload":"receta2"
                 },    
                ]        
             },
            
           ];
          fbService. sendGenericMessage(senderID, elements); 
            },500)
          })    
        break;

        case 'receta0':
          colors.RecetasPollo(function(elementos){
          //console.log(elementos);
           const plato=elementos[0].nombre;
            const findplato =elementos.find( platos => platos.nombre === plato );
             //console.log(findplato);
              const imagenIngre0=findplato.ingre0;
                //console.log(imagenIngre0);
                 fbService.sendImageMessage(senderID,imagenIngre0);
                 setTimeout(function(){
                   let buttons = [  
                     {
                        type:"postback",
                        title:"PREPARACIÓN",
                        payload:"PREPARACÍON0"
                     },
                     {
                         type:"postback",
                        title:"MENÚ RECETAS",
                        payload:"INICIAR_CIBO"
                     },
                   ];
                 fbService.sendButtonMessage(senderID, "Seleccionar", buttons);
                },2000) 
           //     setTimeout(function(){
           //      let replies = [
           //        {
           //        "content_type":"text",
           //        "title":"REGRESO RECETAS",
           //        "payload":"INICIO"
           //        },  
           //         {
           //        "content_type":"text",
           //        "title":"PREPARACIÓN",
           //        "payload":"PREPARACÍON0"
           //        },  
           //       ];  
           //  fbService.sendQuickReply(senderID,"Regresa a menu de recetas ",replies);  
           // },2000)
          });       
        break;

        case 'PREPARACÍON0':
        colors.RecetasPollo(function(elementos){
          //console.log(elementos);
           const plato=elementos[0].nombre;
            const findplato =elementos.find( platos => platos.nombre === plato );
             //console.log(findplato);
              const prepa1=findplato.preparacion1;
               const prepa2=findplato.preparacion2;
                const prepa3=findplato.preparacion3;
                 console.log(prepa1,prepa2,prepa3);
                 fbService.sendImageMessage(senderID,prepa1);
                 setTimeout(function(){
                 fbService.sendImageMessage(senderID,prepa2);
                 },1500)  
               setTimeout(function(){
              fbService.sendImageMessage(senderID,prepa3);
             },3000)          
         });        
        break;

        case 'receta1':
        colors.RecetasPollo(function(elementos){
         const plato1=elementos[1].nombre;
            const findplato1 =elementos.find( platos => platos.nombre === plato1 );
             //console.log(findplato);
              const imagenIngre0=findplato1.ingre0;
                //console.log(imagenIngre0);
                 fbService.sendImageMessage(senderID,imagenIngre0);
                 setTimeout(function(){
                   let buttons = [  
                     {
                        type:"postback",
                        title:"PREPARACIÓN",
                        payload:"PREPARACÍON1"
                     },
                     {
                         type:"postback",
                        title:"MENÚ RECETAS",
                        payload:"INICIAR_CIBO"
                     },
                   ];
                 fbService.sendButtonMessage(senderID, "Seleccionar", buttons);
                },2000) 
              });   
        break;

        case 'PREPARACÍON1':
        colors.RecetasPollo(function(elementos){
          //console.log(elementos);
           const plato2=elementos[1].nombre;
            const findplato1 =elementos.find( platos => platos.nombre === plato2 );
             //console.log(findplato);
              const prepa1=findplato1.preparacion1;
               const prepa2=findplato1.preparacion2;
                const prepa3=findplato1.preparacion3;
                 console.log(prepa1,prepa2,prepa3);
                 fbService.sendImageMessage(senderID,prepa1);
                 setTimeout(function(){
                 fbService.sendImageMessage(senderID,prepa2);
                 },1500)  
               setTimeout(function(){
              fbService.sendImageMessage(senderID,prepa3);
             },3000)          
         });        
        break;

        case 'receta2':
        colors.RecetasPollo(function(elementos){
        const plato2=elementos[2].nombre;
            const findplato2 =elementos.find( platos => platos.nombre === plato2 );
             //console.log(findplato);
              const imagenIngre0=findplato2.ingre0;
                //console.log(imagenIngre0);
                 fbService.sendImageMessage(senderID,imagenIngre0);
                 setTimeout(function(){
                   let buttons = [  
                     {
                        type:"postback",
                        title:"PREPARACIÓN",
                        payload:"PREPARACÍON2"
                     },
                     {
                         type:"postback",
                        title:"MENÚ RECETAS",
                        payload:"INICIAR_CIBO"
                     },
                   ];
                 fbService.sendButtonMessage(senderID, "Seleccionar", buttons);
                },2000) 
              });   
        break;

        case 'PREPARACÍON2':
        colors.RecetasPollo(function(elementos){
          //console.log(elementos);
           const plato2=elementos[2].nombre;
            const findplato2 =elementos.find( platos => platos.nombre === plato2 );
             //console.log(findplato);
              const prepa1=findplato2.preparacion1;
               const prepa2=findplato2.preparacion2;
                const prepa3=findplato2.preparacion3;
                 console.log(prepa1,prepa2,prepa3);
                 fbService.sendImageMessage(senderID,prepa1);
                 setTimeout(function(){
                 fbService.sendImageMessage(senderID,prepa2);
                 },1500)  
               setTimeout(function(){
              fbService.sendImageMessage(senderID,prepa3);
             },3000)          
         })        
        break;

        case 'receta3':
        colors.RecetasPollo(function(elementos){
         const plato3=elementos[3].nombre;
            const findplato3 =elementos.find( platos => platos.nombre === plato3 );
             //console.log(findplato);
              const imagenIngre0=findplato3.ingre0;
                //console.log(imagenIngre0);
                 fbService.sendImageMessage(senderID,imagenIngre0);
                 setTimeout(function(){
                   let buttons = [  
                     {
                        type:"postback",
                        title:"PREPARACIÓN",
                        payload:"PREPARACÍON3"
                     },
                     {
                         type:"postback",
                        title:"MENÚ RECETAS",
                        payload:"INICIAR_CIBO"
                     },
                   ];
                 fbService.sendButtonMessage(senderID, "Seleccionar", buttons);
                },2000) 
               });  
        break;

        case 'PREPARACÍON3':
        colors.RecetasPollo(function(elementos){
          //console.log(elementos);
           const plato3=elementos[3].nombre;
            const findplato3 =elementos.find( platos => platos.nombre === plato3 );
             //console.log(findplato);
              const prepa1=findplato3.preparacion1;
               const prepa2=findplato3.preparacion2;
                const prepa3=findplato3.preparacion3;
                 console.log(prepa1,prepa2,prepa3);
                 fbService.sendImageMessage(senderID,prepa1);
                 setTimeout(function(){
                 fbService.sendImageMessage(senderID,prepa2);
                 },1500)  
               setTimeout(function(){
              fbService.sendImageMessage(senderID,prepa3);
             },3000)          
         });        
        break;

        

        default:
            //unindentified payload
            fbService.sendTextMessage(senderID, "I'm not sure what you want. Can you be more specific?");
            break;

    }

    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, payload, timeOfPostback);

}

// Spin up the server
app.listen(app.get('port'), function () {
    console.log('running on port', app.get('port'))
})
