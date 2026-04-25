using './main.bicep'

param appName = 'urlist'
param location = 'eastus2'
param containerImage = 'ghcr.io/OWNER/urlist:latest' // TODO: replace OWNER with your GitHub org/user
param targetPort = 3000
param cosmosResourceGroup = 'Databases'
param cosmosAccountName = 'DB01'
