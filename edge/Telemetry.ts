import * as os from 'os'
import * as vscode from 'vscode'
import Telemetry from '@vscode/extension-telemetry'

const version = vscode.extensions.getExtension('thisismanta.git-grace').packageJSON.version

export const telemetry = new Telemetry('InstrumentationKey=38b7f881-a4b8-473c-a337-51324dc9dc8b;IngestionEndpoint=https://southeastasia-1.in.applicationinsights.azure.com/;LiveEndpoint=https://southeastasia.livediagnostics.monitor.azure.com/;ApplicationId=949a2b53-9279-4c3e-8d10-2f9b68a0e662')

export const track = telemetry.sendTelemetryEvent.bind(telemetry)

export const error = telemetry.sendTelemetryErrorEvent.bind(telemetry)
