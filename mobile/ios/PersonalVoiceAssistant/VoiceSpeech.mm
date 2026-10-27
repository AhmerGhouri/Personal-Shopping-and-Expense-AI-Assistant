#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface VoiceSpeech : RCTEventEmitter <RCTBridgeModule, AVSpeechSynthesizerDelegate>
@property(nonatomic, strong) AVSpeechSynthesizer *synthesizer;
@property(nonatomic, strong) NSMapTable<AVSpeechUtterance *, NSString *> *identifiers;
@property(nonatomic, copy) NSString *currentId;
@end

@implementation VoiceSpeech
RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
- (NSArray<NSString *> *)supportedEvents { return @[@"VoiceSpeechFinished", @"VoiceSpeechError"]; }

- (instancetype)init {
  if ((self = [super init])) {
    _synthesizer = [AVSpeechSynthesizer new];
    _synthesizer.delegate = self;
    _identifiers = [NSMapTable strongToStrongObjectsMapTable];
  }
  return self;
}

RCT_REMAP_METHOD(speak, speakText:(NSString *)text
                 language:(NSString *)language
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  AVSpeechSynthesisVoice *voice = [AVSpeechSynthesisVoice voiceWithLanguage:language];
  if (!voice) { reject(@"NO_VOICE", @"Install a voice for the selected language.", nil); return; }
  NSError *error = nil;
  AVAudioSession *session = AVAudioSession.sharedInstance;
  [session setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeSpokenAudio
              options:AVAudioSessionCategoryOptionDuckOthers error:&error];
  if (!error) [session setActive:YES error:&error];
  if (error) { reject(@"AUDIO_SESSION", error.localizedDescription, error); return; }
  [self.synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
  AVSpeechUtterance *utterance = [AVSpeechUtterance speechUtteranceWithString:text];
  utterance.voice = voice;
  NSString *identifier = NSUUID.UUID.UUIDString;
  self.currentId = identifier;
  [self.identifiers setObject:identifier forKey:utterance];
  [self.synthesizer speakUtterance:utterance];
  resolve(identifier);
}

RCT_REMAP_METHOD(stop, stopWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  [self.synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
  self.currentId = nil;
  [AVAudioSession.sharedInstance setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
  resolve(nil);
}

- (void)finishUtterance:(AVSpeechUtterance *)utterance {
  NSString *identifier = [self.identifiers objectForKey:utterance];
  if (identifier) [self sendEventWithName:@"VoiceSpeechFinished" body:@{@"utteranceId": identifier}];
  [self.identifiers removeObjectForKey:utterance];
  if ([identifier isEqualToString:self.currentId]) {
    self.currentId = nil;
    [AVAudioSession.sharedInstance setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
  }
}
- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didFinishSpeechUtterance:(AVSpeechUtterance *)utterance { [self finishUtterance:utterance]; }
- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didCancelSpeechUtterance:(AVSpeechUtterance *)utterance { [self finishUtterance:utterance]; }
- (void)invalidate {
  [self.synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
  self.synthesizer.delegate = nil;
  [self.identifiers removeAllObjects];
  [super invalidate];
}
@end
