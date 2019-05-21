'use strict';
const request = require('request');
const config = require('./config');
const pg = require('pg');
pg.defaults.ssl = true;

module.exports = {

     readAllColors: function(callback) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                    'SELECT color FROM public.iphone_colors',
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]);
                        } else {
                            let colors = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                colors.push(result.rows[i]['color']);
                            }
                            callback(colors);
                        };
                    });
        });
        pool.end();
    },

    readUsernews: function(callback, userId) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                   // 'SELECT color FROM public.users WHERE fb_id=$1',
                   'SELECT newsletter FROM public.users WHERE fb_id=$1',
                    [userId],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback('');
                        } else {
                           // callback(result.rows[0]['color']);
                           callback(result.rows[0]['newsletter']);
                        };
                    });

        });
        pool.end();
    },




   updateUserEdad: function(edad, userId) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            let sql = 'UPDATE public.users SET edad=$1 WHERE fb_id=$2';
            client.query(sql,
                [
                    edad,
                    userId
                ]);

        });
        pool.end();
    },

    Readall:function(callback,userId) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                      'SELECT * FROM public.users WHERE fb_id=$1',
                    [userId],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]);
                        } else {
                            let elementos = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                //images.push(result.rows[i]['precio']);
                                elementos.push(result.rows[i]);
                            }
                            callback(elementos);
                        };
                    });
        });
        pool.end();
    },

    RecetasPollo:function(callback) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                      "SELECT * FROM public.recetas WHERE categoria='pollo'",
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]);
                        } else {
                            let elementos = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                //images.push(result.rows[i]['precio']);
                                elementos.push(result.rows[i]);
                            }
                            callback(elementos);
                        };
                    });
        });
        pool.end();
    },

     RecetasPasta:function(callback) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                      "SELECT * FROM public.recetas WHERE categoria='pasta'",
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]);
                        } else {
                            let elementos = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                //images.push(result.rows[i]['precio']);
                                elementos.push(result.rows[i]);
                            }
                            callback(elementos);
                        };
                    });
        });
        pool.end();
    },

    RecetasSopas:function(callback) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                      "SELECT * FROM public.recetas WHERE categoria='sopas'",
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]);
                        } else {
                            let elementos = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                //images.push(result.rows[i]['precio']);
                                elementos.push(result.rows[i]);
                            }
                            callback(elementos);
                        };
                    });
        });
        pool.end();
    },

    RecetasRapidas:function(callback) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                      "SELECT * FROM public.recetas WHERE categoria='rapidas'",
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]);
                        } else {
                            let elementos = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                //images.push(result.rows[i]['precio']);
                                elementos.push(result.rows[i]);
                            }
                            callback(elementos);
                        };
                    });
        });
        pool.end();
    },

    readReceta:function(callback) {
        var pool = new pg.Pool(config.PG_CONFIG);
        pool.connect(function(err, client, done) {
            if (err) {
                return console.error('Error acquiring client', err.stack);
            }
            client
                .query(
                      "SELECT * FROM public.recetas WHERE categoria='rapidas'",
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            callback([]);
                        } else {
                            let elementos = [];
                            for (let i = 0; i < result.rows.length; i++) {
                                //images.push(result.rows[i]['precio']);
                                elementos.push(result.rows[i]);
                            }
                            callback(elementos);
                        };
                    });
        });
        pool.end();
    },

    //---------------
    


}// ultimo
