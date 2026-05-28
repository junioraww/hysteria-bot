export const handleErrors = () => {
    process.on('uncaughtException', (err, origin) => {
        console.error(`Caught exception: ${err}\nException origin: ${origin}`);
    });

    process.on('unhandledRejection', (err, origin) => {
        console.error(`Caught exception: ${err}\nException origin: ${origin}`);
    });
}
