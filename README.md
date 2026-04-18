
# My Record Collection 

This is a social media web app that lets users search the Last.FM database for records to add to their collection or create their own custom records.

It is meant to make it easier for a user to view their whole (physical) record collection and more easier pick what to listen to next. They can sort and filter their collection with tags, rating, release year, and collected date. 

Users can add records to their collection, withlist, or listened list. They can search for their friends, see their collections, and analytically compare their collections. Additionally, they can create lists of records for any occasion.

## Running
Setup a database "mrc_db" with the schema.sql file. 

The frontend and backend are hosted separately. This was to allow me cheaper hosting. :)

Create a .env file with the .env.example file for the backend server and replace with the necessary info for your backend.

In a production environment, the frontend will need two variables:
1. VITE_API_BASE: The base url to the backend API (the api base url is otherwise set in vite.config.ts to "http://localhost:4000" when not in production)
2. VITE_GA_MEASUREMENT_ID: Technically optional, but allows for some basic Google analytics tracking

In a development environment, install the dependencies with `npm install`, then start the frontend with `npm run dev` and the backend with `npm run server`
