// Every jest run (unit + e2e): mail can never leave the process, whatever the shell or a stray .env says.
process.env.NODE_ENV = 'test';
process.env.MAIL_TRANSPORT = 'json';
