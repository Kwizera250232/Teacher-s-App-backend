#!/bin/bash
BACKEND=/root/Teacher-s-App-frontent/Teacher-s-App-backend

# Fix backend /alumni/join to change role and return new token
sed -n '370,400p' $BACKEND/routes/alumni.js
