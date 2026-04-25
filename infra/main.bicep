targetScope = 'resourceGroup'

@description('Base name for all resources')
param appName string = 'urlist'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Container image to deploy (e.g. ghcr.io/yourorg/urlist:latest)')
param containerImage string

@description('Port exposed by the container image')
param targetPort int = 3000

@description('GitHub OAuth Client ID')
@secure()
param githubClientId string

@description('GitHub OAuth Client Secret')
@secure()
param githubClientSecret string

@description('Secret for signing session JWTs')
@secure()
param authSecret string

@description('Resource group containing the existing Cosmos DB account')
param cosmosResourceGroup string = 'Databases'

@description('Name of the existing Cosmos DB account')
param cosmosAccountName string = 'DB01'

// ---------- Reference existing Cosmos DB ----------

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: toLower(cosmosAccountName)
  scope: resourceGroup(cosmosResourceGroup)
}

// ---------- Log Analytics Workspace (required by Container Apps) ----------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ---------- Container Apps Environment ----------

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---------- Container App ----------

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'http'
        allowInsecure: false
      }
      secrets: [
        { name: 'github-client-id', value: githubClientId }
        { name: 'github-client-secret', value: githubClientSecret }
        { name: 'auth-secret', value: authSecret }
        { name: 'cosmos-endpoint', value: cosmosAccount.properties.documentEndpoint }
        { name: 'cosmos-key', value: cosmosAccount.listKeys().primaryMasterKey }
      ]
    }
    template: {
      containers: [
        {
          name: appName
          image: containerImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'GITHUB_CLIENT_ID', secretRef: 'github-client-id' }
            { name: 'GITHUB_CLIENT_SECRET', secretRef: 'github-client-secret' }
            { name: 'AUTH_SECRET', secretRef: 'auth-secret' }
            { name: 'COSMOS_ENDPOINT', secretRef: 'cosmos-endpoint' }
            { name: 'COSMOS_KEY', secretRef: 'cosmos-key' }
            { name: 'COSMOS_DATABASE', value: 'urlist' }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
        rules: [
          {
            name: 'http-scale'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// ---------- Outputs ----------

output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
