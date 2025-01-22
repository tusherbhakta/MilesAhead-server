const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();

const app = express();

// middlewares
app.use(cors({
    origin: ['http://localhost:5173',
        'https://sprint-space.firebaseapp.com',
        'https://sprint-space.web.app'],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

//verify jwt token
const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;
    if (!token) {
        return res.status(403).send("A token is required for authentication");
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        // console.log("decoded", decoded);
    } catch (err) {
        return res.status(401).send("Invalid Token");
    }
    return next();
};


const PORT =  3008;


// MongoDB Database Connection

const uri = process.env.MONGODB_URI;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {
        // await client.connect();
        console.log("Connected to the server");
        const database = client.db("sprintSpace");
        const eventsCollection = database.collection("events");
        const registrationCollection = database.collection("registrations");

        // jwt

        app.post('/jwt', (req, res) => {
            const { user } = req.body;
            const token = jwt.sign({ user }, process.env.JWT_SECRET, { expiresIn: '5h' });
            res.cookie('token', token, cookieOptions).send({ success: 'Token sent' });
        });

        app.post('/logout', (req, res) => {
            res.clearCookie('token', cookieOptions).send({ success: 'Logged out' });
        });


        // Events operation

        app.get('/events', async (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 9; // Updated limit
            const skip = (page - 1) * limit;
            const email = req.query.email;
            let query = {}
            if (email) {
                query = { userEmail: email }
            }
            const myEvents = await eventsCollection.find(query).toArray();

            const events = await eventsCollection.find(query).skip(skip).limit(limit).toArray();
            const totalEvents = await eventsCollection.countDocuments();
            res.send({
                myEvents,
                events,
                totalEvents,
                totalPages: Math.ceil(totalEvents / limit),
                currentPage: page
            });
        });

        app.get('/events/details/:id',  async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send('Invalid event ID');
            }
            const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
            res.send(event);
        });

        app.get('/running-events', async (req, res) => {
            const limitt = parseInt(req.query.limit) || 6;
            const currentDate = new Date().toISOString().split("T")[0];
            const marathons = await eventsCollection.find({ marathonStartDate: { $gt: currentDate } }).limit(limitt).toArray();
            const randomRunningEvents = marathons.sort(() => Math.random() - Math.random()).slice(0, 3);
            res.send({
                marathons,
                randomRunningEvents
            });
        });

        // app.get('/campaigns/:id/donations', async (req, res) => {
        //     const id = req.params.id;
        //     if (!ObjectId.isValid(id)) {
        //         return res.status(400).send('Invalid campaign ID');
        //     }
        //     const donations = await donatationCollection.find({ campaignId: id }).toArray();
        //     res.send(donations);
        // });



        app.post('/events', verifyToken, async (req, res) => {

            const newEvent = req.body;
            // console.log(newCampaign);
            const result = await eventsCollection.insertOne(newEvent);
            res.send(result);
        });

        app.put('/events/:id', verifyToken, async (req, res) => {
            if (req.user.email !== req.query.email) {
                return res.status(403).send("Not authorized");
            }
            const id = req.params.id;
            const updatedEvent = req.body;
            const result = await eventsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedEvent });
            res.send(result);
        });

        app.delete('/events/:id', verifyToken, async (req, res) => {
            if (req.user.email !== req.query.email) {
                return res.status(403).send("Not authorized");
            }

            const id = req.params.id;
            const result = await eventsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Registration Operations

        // app.get('/registrations', verifyToken, async (req, res) => {
        //     const email = req.query.email;
        //     let query = {}
        //     if (email) {
        //         query = { userEmail: email }
        //     }
        //     const registrations = await registrationCollection.find(query).toArray();
        //     res.send(registrations);
        // });
        app.get('/registrations', verifyToken, async (req, res) => {
            const email = req.query.email;
            const search = req.query.search; // Get the search query parameter
            let query = {};

            if (email) {
                query.userEmail = email;
            }

            if (search) {
                query.eventTitle = { $regex: search, $options: "i" }; // Case-insensitive search
            }

            try {
                const registrations = await registrationCollection.find(query).toArray();
                res.send(registrations);
            } catch (error) {
                console.error("Error fetching registrations:", error);
                res.status(500).send({ error: "Failed to fetch registrations." });
            }
        });


        app.get('/registrations/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) {
                return res.status(400).send('Invalid registration ID');
            }


            const registration = await registrationCollection.findOne({ _id: new ObjectId(id) });
            res.send(registration);
        });

        app.post('/registrations', verifyToken, async (req, res) => {
            try {
                const newRegistration = req.body;
                const result = await registrationCollection.insertOne(newRegistration);

                const id = newRegistration.eventId;
                const query = { _id: new ObjectId(id) };
                const event = await eventsCollection.findOne(query);

                const count = (event.totalRegistrationCount || 0) + 1;
                await eventsCollection.updateOne(query, { $set: { totalRegistrationCount: count } });

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'An error occurred', error });
            }
        });

        app.put('/registrations/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const updatedRegistration = req.body;
            delete updatedRegistration._id; // Ensure _id is not included in the update
            const result = await registrationCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedRegistration });
            res.send(result);
        });

        app.delete('/registrations/:id', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;

                // Find the registration document to get the eventId
                const registration = await registrationCollection.findOne({ _id: new ObjectId(id) });
                if (!registration) {
                    return res.status(404).send({ message: 'Registration not found' });
                }

                const eventID = registration.eventId;
                const result = await registrationCollection.deleteOne({ _id: new ObjectId(id) });

                const query = { _id: new ObjectId(eventID) };
                const event = await eventsCollection.findOne(query);
                if (!event) {
                    return res.status(404).send({ message: 'Event not found' });
                }

                const count = (event.totalRegistrationCount) - 1;
                await eventsCollection.updateOne(query, { $set: { totalRegistrationCount: count } });

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: 'An error occurred', error });
            }
        });


        // Testing

        app.get('/', (req, res) => {
            res.send('Hello World');
        });

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });

    } catch (error) {
        console.error(error);
    }
}

run().catch(console.dir);

// UqPicmzp4D60s6k6
// tenet025


