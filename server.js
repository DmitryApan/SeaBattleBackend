const express = require('express')
const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const redis = require('redis')
const redisStorage = require('connect-redis')(session)
const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2')
const cors = require('cors')
const flash = require('connect-flash')

//import {shuffle} from `${process.env.PWD}/logic.js`

const client = redis.createClient({
	host: 'redis-12791.c92.us-east-1-3.ec2.cloud.redislabs.com',
	port: 12791,
	password: '2ggRuP6nhhC1hygn5EEa6hz0DtlIoiqR'
})

const PORT = process.env.PORT || 5000

client.on('error', err => {
	console.log('Error redis: ' + err);
})

const app = express()

app.use(cors({
	credentials: true,
	origin: 'https://seabattles.herokuapp.com'
	
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(
	session({
		store: new redisStorage({
			client: client,
		}),
		secret: 'you secret key',
		resave: true,
		rolling: true,
		saveUninitialized: true,
		cookie: {
			sameSite: 'none',
			sameSite: 'lax',			
			secure: true,				
		},
	})
)
app.use(flash())
app.use(passport.initialize())
app.use(passport.session())

passport.use(new LocalStrategy(
	{
		usernameField: 'email',
		passwordField: 'password'
	},
	function (username, password, done) {
		User.findOne({ email: username }, '_id email password', function (err, user) {
			if (err) { return done(err); }
			if (!user) {
				return done(null, false, { message: 'Incorrect email or password' });
			}
			if (user.password !== password) {
				return done(null, false, { message: 'Incorrect email or password' });
			}
			return done(null, user);
		})
	}
))
passport.serializeUser(function (user, done) {
	done(null, user._id)
})
passport.deserializeUser(function (id, done) {
	User.findById(id, '_id email name', function (err, user) {
		done(err, user);
	})

})

app.get('/api', function(req, res) {
	res.sendFile(process.env.PWD + '/api/seaBattlesAPI.html')
})

app.get('/auth/me', function (req, res) {
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")

	const { user } = req

	if (user) {
		res.send({
			data: {
				id: user._id,
				name: user.name,
				email: user.email
			},
			resultCode: 0,
			messages: []
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.post('/auth/login', function (req, res) {

	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
	res.header("Access-Control-Max-Age", "300")

	if (req.body.rememberMe) {
		req.session.cookie.expires = true
		req.session.cookie.maxAge = 180 * 24 * 60 * 60 * 1000
		req.session.save()
	}

	passport.authenticate('local', function (err, user, info) {
		if (err) {
			return res.send({
				data: {},
				resultCode: 1,
				messages: [err]
			})
		}
		if (!user) {
			return res.send({
				data: {},
				resultCode: 1,
				messages: [info.message]
			});
		}
		req.logIn(user, function (err) {
			if (err) {
				return res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			}
			return res.send({
				data: {
					_id: user._id,
					name: user.name,
					email: user.email
				},
				resultCode: 0,
				messages: []
			})
		})
	})(req, res)
})

app.get('/auth/logout', function (req, res) {
	req.logOut()
	req.session.destroy(function () {
		res.cookie("connect.sid", "", { expires: new Date() }).send({
			resultCode: 0,
			messages: []
		})
	})
})

app.post('/auth/register', function (req, res) {
	const { email, password, rememberMe } = req.body

	if (rememberMe) {
		req.session.cookie.expires = true
		req.session.cookie.maxAge = 180 * 24 * 60 * 60 * 1000
		req.session.save()
	}

	if (!email || !password) {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['Not all data']
		})

		return
	}

	User.findOne({ email }, function (err, user) {
		if (user) {
			res.send({
				data: {},
				resultCode: 1,
				messages: ['User exists']
			})

			return
		}

		if (err) {
			res.send({
				data: {},
				resultCode: 1,
				messages: [err]
			})

			return
		}

		const newUser = new User({ email, password });
		newUser.save(function (err, user) {
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			} else {
				req.logIn(user, function (err) {
					if (err) {
						res.send({
							data: {},
							resultCode: 1,
							messages: [err]
						})
					} else {
						res.send({
							data: {
								id: user._id,
								email: user.email
							},
							resultCode: 0,
							messages: []
						})
					}
				})
			}
		})
	})
})

app.get('/profile/me', function (req, res) {
	const { user } = req

	if (user) {
		res.send({
			data: {
				id: user._id,
				name: user.name,
				avatar: user.avatar,
				isBattle: user.isBattle,
				numBattles: user.numBattles,
				numVictories: user.numVictories,
			},
			resultCode: 0,
			messages: []
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.post('/profile/me', function (req, res) {
	const { user, body } = req
	const { name, avatar } = body
	let properties = {}

	if (name) {
		properties = { ...properties, name }
	}

	if (avatar) {
		properties = { ...properties, avatar }
	}

	if (user) {
		User.findByIdAndUpdate(user._id, { ...properties }, function (err, user) {
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			} else {
				res.send({
					data: {
						id: user._id,
						name: name || user.name,
						avatar: avatar || user.avatar,
						isBattle: user.isBattle,
						numBattles: user.numBattles,
						numVictories: user.numVictories,
					},
					resultCode: 0,
					messages: []
				})
			}
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.get('/profile/:userId', function (req, res) {
	const { user } = req
	const userId = req.params['userId']

	if (user) {
		User.findById(userId, function (err, user) {
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			} else {
				res.send({
					data: {
						id: user._id,
						name: user.name,
						avatar: user.avatar,
						isBattle: user.isBattle,
						numBattles: user.numBattles,
						numVictories: user.numVictories,
					},
					resultCode: 0,
					messages: []
				})
			}
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.get('/battles', function (req, res) {
	const {user, body} = req
	const {count, page} = body
	
	if (user) {
		let useCount = 10, usePage = 1 

		if (count && (count > 0 && count <= 100)) {
			useCount = count
		}

		if (page && page > 0) {
			usePage = page
		}

		const optionsPaginate = {
			page: usePage,
			limit: useCount,
			customLabels: {
				totalDocs: 'totalCount',
				docs: 'battles'
			}
		}

		Battle.paginate({status: 0}, optionsPaginate, function(err, {battles, totalCount}) {
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			} else {
				res.send({
					data: {
						totalCount,
						battles
					},
					resultCode: 0,
					messages: []
				})
			}
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.post('/battles', function(req, res) {

	const {user, body} = req
	const {type, maxParticipants, battlefieldSize, description} = body

	if (user) {
		let useType = 0, useMaxParticipants = 2, useBattlefieldSize = 10, useDescription = 'Battle'
		
		Battle.find({
			userId: user._id,
			status: {$lte: 1}
		}, function(err, battles) {

			if (battles) {
				res.send({
					data: {},
					resultCode: 1,
					messages: ['Battles exists']
				})
	
				return
			}
	
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
	
				return
			}
		})

		if (type && (type == 0 || type == 1)) {
			useType = type
		}

		if (maxParticipants && (maxParticipants >= 2 && maxParticipants <= 20)) {
			useMaxParticipants = maxParticipants
		}

		if (battlefieldSize && (battlefieldSize >= 10 && battlefieldSize <= 15)) {
			useBattlefieldSize = battlefieldSize
		}

		if (description) {
			useDescription = description
		}

		Battle.create({
			userId: user._id,
			type: useType, 
			maxParticipants: useMaxParticipants,
			battlefieldSize: useBattlefieldSize,
			description: useDescription
		}, function(err, battle) {
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			} else {
				res.send({
					data: battle,
					resultCode: 0,
					messages: []
				})
			}
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.get('/battles/me', function(req, res) {
	const {user} = req

	if (user) {
		Battle.findOne({
			userId: user._id,
			status: {$lte: 1}
		}, function(err, battle) {
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			} else {
				res.send({
					data: battle,
					resultCode: 0,
					messages: []
				})
			}
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.delete('/battles/me', function(req, res) {
	const {user} = req
	
	if (user) {
		Battles.updateOne({
			userId: user._id,
			status: {$lte: 1}
		}, {
			$set: {status: 5}
		}, function(err, res) {
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			} else {
				res.send({
					resultCode: 0,
					messages: []
				})
			}
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.get('/battles/:battleId', function(req, res) {
	const {user} = req
	const battleId = req.params['battleId']
	
	if (user) {
		Battle.findOne({battleId}, function(err, battle) {
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			} else {
				if (battle) {
					res.send({
						data: battle,
						resultCode: 0,
						messages: []
					})
				} else {
					res.send({
						data: {},
						resultCode: 1,
						messages: ['Battle is not found']
					})
				}				
			}
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.post('/battles/:battleId', function(req, res) {
	const {user, boby} = req
	const {battleId} = req.params['battleId']
	const {side} = boby

	if (user) {
		Battle.findOne({battleId, status: 0}, function(err, battle) {
			if (err) {
				res.send({
					data: {},
					resultCode: 1,
					messages: [err]
				})
			} else {
				if (battle) {
					const {type, greenIds, maxParticipants, battlefieldSize} = battle

					if (type == 'random') {
						if (greenIds.length + 1 < maxParticipants) {
							Battle.updateOne({battleId}, {$set: {
									greenIds: [...greenIds, user._id]
							}}, function(err, res) {
								if (err) {
									res.send({
										data: {},
										resultCode: 1,
										messages: [err]
									})
								} else {
									res.send({
										data: {...battle, greenIds: [...greenIds, user._id]},
										resultCode: 0,
										messages: []
									})
								}
							})

						} else {
							//const randomIds = shuffle([...greenIds, user._id])
							const randomIds = []
							const newGreenIds = randomIds.slice(0, Math.floor(maxParticipants / 2))
							const newRedIds = randomIds.slice(Math.floor(maxParticipants / 2))
							const newGreenStatuses = Array.from(Array(newGreenIds.length), () => 0)
							const newRedStatuses = Array.from(Array(newRedIds.length), () => 0)												
							const fieldsGreen = newGreenIds.map((id) => ({
								status: 0,
								side: 0,
								battleId,
								userId: id,
								field: Array.from(Array(battlefieldSize), () => Array.from(Array(battlefieldSize), () => 0)),
								fieldStatus: Array.from(Array(battlefieldSize), () => Array.from(Array(battlefieldSize), () => 0)),
								fieldTarget: Array.from(Array(battlefieldSize), () => Array.from(Array(battlefieldSize), () => 0))
							}))
							const fieldsRed = newRedIds.map((id) => ({
								status: 0,
								side: 0,
								battleId,
								userId: id,
								field: Array.from(Array(battlefieldSize), () => Array.from(Array(battlefieldSize), () => 0)),
								fieldStatus: Array.from(Array(battlefieldSize), () => Array.from(Array(battlefieldSize), () => 0)),
								fieldTarget: Array.from(Array(battlefieldSize), () => Array.from(Array(battlefieldSize), () => 0))
							}))

							Field.insertMany([...fieldsGreen, ...fieldsRed], function(err, res) {
								if (err) {
									res.send({
										data: {},
										resultCode: 1,
										messages: [err]
									})
								} else {
									Battle.updateOne({battleId}, {$set: {
										greenIds: newGreenIds,
										redIds: newRedIds,
										greenStatuses: newGreenStatuses,
										redStatuses: newRedStatuses,
										status: 1
									}}, function(err, res) {
										if (err) {
											res.send({
												data: {},
												resultCode: 1,
												messages: [err]
											})
										} else {
											res.send({
												data: {
													...battle, 
													greenIds: newGreenIds,
													redIds: newRedIds,
													greenStatuses: newGreenStatuses,
													redStatuses: newRedStatuses,
													status: 1
												},
												resultCode: 0,
												messages: []
											})
										}
									})
								}
							})
						}
					} else {
						if (!side || (side != 0 && side != 1)) {
							side = 0
						}


					}
				} else {
					res.send({
						data: {},
						resultCode: 1,
						messages: ['Unable to join the battle']
					})
				}
			}
		})
	} else {
		res.send({
			data: {},
			resultCode: 1,
			messages: ['You are not authorized']
		})
	}
})

app.listen(PORT, function () {
	console.log(`Server listens port: ${PORT}`)
})

mongoose.set('useFindAndModify', false);
mongoose.connect('mongodb+srv://admin:Rze4KoVp6pDjhhUq@cluster0.ryopc.mongodb.net/test?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true })
	.then(() => console.log('MongoDB Connected!'));

const userSchema = new mongoose.Schema({
	email: String,
	password: String,
	name: {
		type: String,
		default: 'noName'
	},
	avatar: {
		type: String,
		default: ''
	},
	isBattle: {
		type: Boolean,
		default: false
	},
	numBattles: {
		type: Number,
		default: 0
	},
	numVictories: {
		type: Number,
		default: 0
	}
})
const User = mongoose.model('User', userSchema)

const battleSchema = new mongoose.Schema({
	userId: String,
	type: Number,
	status: {
		type: Number,
		default: 0
	},
	greenIds: {
		type: [String],
		default: []
	},
	redIds: {
		type: [String],
		default: []
	},
	greenStatuses: {
		type: [Number],
		default: []
	},
	redStatuses: {
		type: [Number],
		default: []
	},
	maxParticipants: Number,
	battlefieldSize: Number,
	description: String
})
battleSchema.plugin(mongoosePaginate)
const Battle = mongoose.model('Battle', battleSchema)

const fieldSchema = new mongoose.Schema({
	status: {
		type: Number,
		default: 0
	},
	side: Number,
	battleId: String,
	userId: String,
	field: {
		type: [Number],
		default: []
	},
	fieldStatus: {
		type: [Number],
		default: []
	},
	fieldTarget: {
		type: [Number],
		default: []
	}
})
const Field = mongoose.model('Field', fieldSchema)

// const deviceSchema = new mongoose.Schema({
// 	deviceId: String,
// 	deviceName: String,
// 	firmwareVersion: String
// });
// const Device = mongoose.model('Device', deviceSchema);

// const measurementSchema = new mongoose.Schema({
// 	deviceId: String,
// 	status: String,
// 	channels: [Object],
// 	requestTimestamp: Number,
// 	startTimestamp: Number,
// 	stopTimestamp: Number,
// 	measurementTime: Number
// });
// const Measurement = mongoose.model('Measurement', measurementSchema);

// const dataSchema = new mongoose.Schema({
// 	measurementId: String,
// 	data: Object
// });
// const Data = mongoose.model('Data', dataSchema);

// server.listen(port, host, () => {
// 	console.log('TCP Server is running on port ' + port + '.');
// });

// server.on('connection', function(sock) {
// 	console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);

// 	sock.setEncoding('utf8');

// 	var sockBuf = '';

// 	sock.on('data', (data) => {

// 		sockBuf += data;
// 		var i;
// 		var l = 0;
// 		while ((i = sockBuf.indexOf('\r\n', l)) !== -1) {
// 			try {
// 				console.log(JSON.parse(sockBuf.slice(l, i)));
// 				sock.emit('event', JSON.parse(sockBuf.slice(l, i)));
// 			}
// 			catch {
// 				console.log('JSON error parse!')
// 			}

// 			l = i + 1;
// 		}
// 		if (l) {
// 			sockBuf = sockBuf.slice(l);
// 		}
// 	});

// 	sock.on('close', () => {
// 		console.log('DISCONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
// 	});

// 	sock.on('event', (data) => {
// 		switch(data.act) {
// 			case 'GET_MEASUREMENT':
// 				console.log('Get measurement ' + data.deviceId);

// 				try {
// 					sock.write(JSON.stringify(
// 						Measurement.find(item => item.deviceId === data.deviceId)
// 					));
// 				} catch {
// 					console.log('Error find measurement!');
// 				}				 

// 				break;
// 		}
// 	})
// });