package com.ekmivo.mobile.inbox
import org.junit.Assert.*
import org.junit.Test
class CustomerVerdictTest {
 @Test fun zeroAndUnknownAreDifferent(){val fresh=CustomerVerdict.from(0,0,0,0,1);assertNull(fresh.rate);assertEquals("new",fresh.key);val zero=CustomerVerdict.from(0,3,0,0,1);assertEquals(0,zero.rate);assertEquals("risk",zero.key)}
 @Test fun firstOrdersAndConversationThresholds(){assertEquals("first",CustomerVerdict.from(0,0,0,1,1).key);assertEquals("frequent",CustomerVerdict.from(0,0,0,0,4).key);assertEquals("neutral",CustomerVerdict.from(0,0,0,0,3).key);assertEquals("start",CustomerVerdict.from(2,0,0,0,1).key);assertEquals("caution",CustomerVerdict.from(1,1,0,0,1).key)}
 @Test fun runningDoesNotDiluteCompletionRate(){assertEquals(100,CustomerVerdict.from(3,0,0,20,1).rate);assertEquals("trusted",CustomerVerdict.from(17,3,0,0,1).key);assertEquals("average",CustomerVerdict.from(3,2,0,0,1).key);assertEquals("risk",CustomerVerdict.from(2,3,0,0,1).key)}
}
