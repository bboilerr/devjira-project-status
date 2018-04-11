# devjira-project-status

## Install and Build

### Clone repository
`git clone https://github.com/bboilerr/devjira-project-status.git`

### Install Node Modules
`npm install`

### Build project
`npm run build`

### Continuously build project for development
`npm run dev`

## Configuration

### Google API Client Secret File Creation
Follow the instructions on the [Google Sheets API Node.js Quickstart](https://developers.google.com/sheets/api/quickstart/nodejs) to download client_secret.json. Then:

`cp path/to/client_secret.json src/client-secret.json`

**Note**: Yeah, the underscore is changed to a dash. Probably shouldn't be, but when I started this I liked the dash better, and I'm too lazy to change it now.

### Config example
View src/config.example.json for an example config file, then run:

`cp src/config.example.json src/config.json`

### Jira Config
Point to your jira instance and add your jira username and password.

### Express Config
Configure the port for the web server used to allow initiating project status updates from the browser.

### Nodemailer Config
The config here is passed directly to [nodemailer](https://nodemailer.com)'s nodemailer.createTransport(). You can configure your own SMTP server or use Gmail, for example.

#### Nodemailer Gmail
Instructions for using Gmail with nodemailer can be found [here](https://community.nodemailer.com/using-gmail/).

### Searches Config
The searches represent the Jira searches for which project status can be generated. Each has a name, a jira JQL search, and some additional optional options for scheduling the generation of the project status updates and mailing them out.

#### Search Mailer Config
Here, you can set where the emails come from and where they are sent to.

#### Search Schedulers Config
Here, you can schedule generation of project status reports for the search at certain times.  This supports:

* minute (0-59)
* hour (0-23)
* dayOfWeek Array (0-6) Starting with Sunday

This way, you can set project status generation every week on a certain day or set of days at a certain hour and minute.

## Running

### Generating a single project status
`npm start -- --search search_name`

Use this to generate a single project status report using the configured jira search corresponding to the search name in the command line.

### Running continuously
`npm start -- --serve`

Use this to continuously run the service for schedule reports. Also, with this and the Express configuration, this will serve a web app at [http://localhost:3210] (or the configured port) which will allow push-button generation of project status reports for the configured jira searches.