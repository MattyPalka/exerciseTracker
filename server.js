const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')

const mongoose = require('mongoose')
mongoose.connect(process.env.MONGO_URI, {useNewUrlParser: true});

//User schema
const Users = new mongoose.Schema({
  username: String
})

//Exercise Schema
const Exercises = new mongoose.Schema({
  userId: {
    type: String,
    ref: 'Users',
    index: true
  },
  username: String,
  description: {
    type: String,
    required: true,
    maxlength: [20, 'description too long']
  },
  duration: {
    type: Number,
    required: true,
    min: [1, 'duration too short']
  },
  date: {
    type: Date,
    default: Date.now
  }
})

let User = mongoose.model('Users', Users)

//Extra configuration for Exercise to validate user
Exercises.pre('save', function(next){
  User.findById(this.userId, (err, user) => {
    if (err) return next(err)
    if(!user) {
      return next({status: 400, message: 'userId not found'})
    }
    this.username = user.username
    if (!this.date) {
      this.date = Date.now()
    }
    next()
  })
})

let Exercise = mongoose.model('Exercises', Exercises)



app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});


/* Create New User, and if username taken inform user about it */
app.post('/api/exercise/new-user', (req, res, next) => {
  
  User.findOne({username: req.body.username}, (err, storedUser) => {
    if (err) return
    if (storedUser) {
      return (next ({status: 400, message: 'Username taken'}))
    } else {
      let user = new User ({username: req.body.username})
      user.save((err, savedUser) => {
        if (err) return
        res.json({
          username: savedUser.username,
          id: savedUser._id
        })
      })
    }
  })
})

/* Add new excercise for a specific user */
app.post('/api/exercise/add', (req, res, next) => {
  User.findById(req.body.userId, (err, storedUser) => {
    if (err) return
    if (!storedUser) {
      return next({status: 400, message: 'user not found'})
    }
    let exercise = new Exercise (req.body)
    exercise.username = storedUser.username
    exercise.save((err, savedExercise) =>{
      if (err) return
      savedExercise = savedExercise.toObject()
      delete savedExercise.__v
      savedExercise._id = savedExercise.userId
      delete savedExercise.userId
      savedExercise.date = new Date(savedExercise.date).toDateString()
      res.json(savedExercise)
    })
  })
})

/*Get the list of all users*/
app.get('/api/exercise/users', (req, res, next) => {
  User.find({}, (err, data) => {
    res.json(data)
  })
})

/*Get user exercise log*/
app.get('/api/exercise/log', (req, res, next) => {
  const from = new Date(req.query.from)
  const to = new Date(req.query.to)
  console.log(req.query.userId)
  User.findById(req.query.userId, (err, user) => {
    if (err) return next(err)
    if (!user) {
      return next({status: 400, message: 'unknown user id. Try ?userId=[...]'})
    }
    Exercise.find({
      userId: req.query.userId,
      date: {
        $lt: to != 'Invalid Date' ? to.getTime() : Date.now(),
        $gt: from != 'Invalid Date' ? from.getTime() : 0
      }
    }).sort('-date').limit(parseInt(req.query.limit)).exec((err, exercises) => {
      if (err) return next(err)
      const out = {
        _id: req.query.userId,
        user: user.username,
        from : from != 'Invalid Date' ? from.toDateString() : undefined,
        to : to != 'Invalid Date' ? to.toDateString(): undefined,
        count: exercises.length,
        log: exercises.map(e => ({
            description : e.description,
            duration : e.duration,
            date: e.date.toDateString()
          })
        )
      }
      res.json(out)
    })
  })
})

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
